import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { firstValueFrom } from 'rxjs';

// ─── Types ────────────────────────────────────────────────────────────────────

type SystemRole = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';

interface UserRow {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  system_role: SystemRole;
  status: 'ACTIVE' | 'DISABLED' | 'PENDING';
  password_hash: string | null;
  avatar: string | null;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  username: string;
  systemRole: SystemRole;
  realm_access: { roles: string[] };
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly pool: Pool;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly http: HttpService
  ) {
    this.pool = new Pool({
      connectionString:
        this.config.get<string>('USER_DATABASE_URL') ||
        'postgresql://postgres:postgres@localhost:5432/laas_users',
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.migrateSchema();
    await this.ensureAdminAccount();
  }

  private async migrateSchema(): Promise<void> {
    // auth-service only creates tables it OWNS.
    // The `users` table is owned by user-service (Prisma). Run user-service migrations first.

    // Refresh tokens
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL,
        token_hash  TEXT UNIQUE NOT NULL,
        device_info TEXT,
        ip_address  TEXT,
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`ALTER TABLE refresh_tokens ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_rt_user_id ON refresh_tokens (user_id)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens (expires_at)`);

    // OAuth providers
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_providers (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL,
        provider     TEXT NOT NULL,
        provider_id  TEXT NOT NULL,
        email        TEXT,
        display_name TEXT,
        avatar_url   TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (provider, provider_id)
      )
    `);
    await this.pool.query(`ALTER TABLE oauth_providers ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_op_user_id ON oauth_providers (user_id)`);

    // Password reset tokens
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`ALTER TABLE password_reset_tokens ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens (user_id)`);
  }

  // ── Public: Login ──────────────────────────────────────────────────────────

  async login(identity: string, password: string, ipAddress?: string) {
    const user = await this.findByIdentity(identity);

    if (!user) throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    if (user.status === 'DISABLED') throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    if (user.status === 'PENDING') throw new UnauthorizedException('Tài khoản chưa được kích hoạt');
    if (!user.password_hash || !this.verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    await this.pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    const tokens = await this.issueTokenPair(user, ipAddress);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  // ── Public: Register ───────────────────────────────────────────────────────

  async register(
    dto: { fullName: string; email: string; username: string; password: string; phone?: string },
    ipAddress?: string
  ) {
    // Check uniqueness
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2) LIMIT 1`,
      [dto.email.trim(), dto.username.trim()]
    );
    if (existing.rows[0]) {
      throw new ConflictException('Email hoặc tên đăng nhập đã tồn tại');
    }

    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO users (id, keycloak_user_id, email, username, full_name, phone, system_role,
        status, password_hash, language, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'STUDENT', 'ACTIVE', $7, 'vi', 'Asia/Ho_Chi_Minh', NOW(), NOW())`,
      [
        id,
        `local-${dto.username.trim().toLowerCase()}`,
        dto.email.trim().toLowerCase(),
        dto.username.trim(),
        dto.fullName.trim(),
        dto.phone?.trim() || null,
        this.hashPassword(dto.password),
      ]
    );

    const user = await this.findById(id);
    if (!user) throw new Error('User creation failed');

    const tokens = await this.issueTokenPair(user, ipAddress);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  // ── Public: Refresh ────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    const row = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    const rt = row.rows[0];
    if (!rt) throw new UnauthorizedException('Refresh token không hợp lệ');
    if (rt.revoked_at) throw new UnauthorizedException('Refresh token đã bị thu hồi');
    if (new Date(rt.expires_at) < new Date()) throw new UnauthorizedException('Refresh token đã hết hạn');

    const user = await this.findById(rt.user_id);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản không còn hoạt động');

    // Rotate: revoke old, issue new
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [rt.id]);

    const newAccessToken = await this.signJwt(user);
    const newRt = await this.createRefreshToken(rt.user_id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRt,
      tokenType: 'Bearer' as const,
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '1h',
    };
  }

  // ── Public: Logout ─────────────────────────────────────────────────────────

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    return { success: true, message: 'Đã đăng xuất' };
  }

  // ── Public: Forgot Password ────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.findByIdentity(email);
    // Always return success to avoid user enumeration
    if (!user || user.status !== 'ACTIVE') {
      return { success: true, message: 'Nếu email tồn tại, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu' };
    }

    // Invalidate existing unused tokens
    await this.pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // In production: send email with reset link containing rawToken
    // For now, log it (development only)
    this.logger.log(`[DEV] Password reset token for ${email}: ${rawToken}`);

    return { success: true, message: 'Nếu email tồn tại, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu' };
  }

  // ── Public: Reset Password ─────────────────────────────────────────────────

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);

    const row = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    const prt = row.rows[0];
    if (!prt) throw new BadRequestException('Token không hợp lệ');
    if (prt.used_at) throw new BadRequestException('Token đã được sử dụng');
    if (new Date(prt.expires_at) < new Date()) throw new BadRequestException('Token đã hết hạn');

    const passwordHash = this.hashPassword(newPassword);
    await this.pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, prt.user_id]
    );
    await this.pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [prt.id]
    );

    // Revoke all refresh tokens for security
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [prt.user_id]
    );

    return { success: true, message: 'Mật khẩu đã được đặt lại thành công' };
  }

  // ── Public: Change Password ────────────────────────────────────────────────

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (!user.password_hash || !this.verifyPassword(currentPassword, user.password_hash)) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    await this.pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [this.hashPassword(newPassword), userId]
    );

    // Revoke all refresh tokens
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    return { success: true, message: 'Mật khẩu đã được thay đổi' };
  }

  // ── Public: Get Profile ────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return this.toPublicUser(user);
  }

  // ── Public: Google OAuth ───────────────────────────────────────────────────

  getGoogleAuthUrl(): string {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') || '';
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI') || '';
    const scope = 'openid email profile';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(code: string, ipAddress?: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') || '';
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET') || '';
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI') || '';

    // Exchange code for tokens
    const tokenRes = await firstValueFrom(
      this.http.post<{
        access_token: string;
        id_token?: string;
      }>('https://oauth2.googleapis.com/token', new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );

    // Get user info
    const userInfoRes = await firstValueFrom(
      this.http.get<{ sub: string; email: string; name: string; picture?: string }>(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } }
      )
    );

    const { sub: providerId, email, name, picture } = userInfoRes.data;
    return this.findOrCreateOAuthUser('google', providerId, email, name, picture, ipAddress);
  }

  // ── Public: Facebook OAuth ─────────────────────────────────────────────────

  getFacebookAuthUrl(): string {
    const appId = this.config.get<string>('FACEBOOK_APP_ID') || '';
    const redirectUri = this.config.get<string>('FACEBOOK_REDIRECT_URI') || '';
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email,public_profile',
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  async handleFacebookCallback(code: string, ipAddress?: string) {
    const appId = this.config.get<string>('FACEBOOK_APP_ID') || '';
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET') || '';
    const redirectUri = this.config.get<string>('FACEBOOK_REDIRECT_URI') || '';

    // Exchange code for access token
    const tokenRes = await firstValueFrom(
      this.http.get<{ access_token: string }>(
        `https://graph.facebook.com/v19.0/oauth/access_token`,
        {
          params: {
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code,
          },
        }
      )
    );

    // Get user info
    const userInfoRes = await firstValueFrom(
      this.http.get<{ id: string; email: string; name: string; picture?: { data?: { url?: string } } }>(
        'https://graph.facebook.com/me',
        {
          params: {
            access_token: tokenRes.data.access_token,
            fields: 'id,name,email,picture',
          },
        }
      )
    );

    const { id: providerId, email, name, picture } = userInfoRes.data;
    const avatarUrl = picture?.data?.url;
    return this.findOrCreateOAuthUser('facebook', providerId, email, name, avatarUrl, ipAddress);
  }

  // ── Private: OAuth user find/create ───────────────────────────────────────

  private async findOrCreateOAuthUser(
    provider: string,
    providerId: string,
    email: string | undefined,
    displayName: string,
    avatarUrl: string | undefined,
    ipAddress?: string
  ) {
    // Find by OAuth provider link
    const oauthRow = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM oauth_providers WHERE provider = $1 AND provider_id = $2 LIMIT 1`,
      [provider, providerId]
    );

    let userId: string;

    if (oauthRow.rows[0]) {
      userId = oauthRow.rows[0].user_id;
      // Update avatar
      await this.pool.query(
        `UPDATE oauth_providers SET display_name = $1, avatar_url = $2, updated_at = NOW()
         WHERE provider = $3 AND provider_id = $4`,
        [displayName, avatarUrl || null, provider, providerId]
      );
    } else {
      // Try to find by email, else create new user
      let user: UserRow | null = email ? await this.findByIdentity(email) : null;

      if (!user) {
        // Create new STUDENT account
        const newId = randomUUID();
        const username = await this.generateUniqueUsername(displayName);
        await this.pool.query(
          `INSERT INTO users (id, keycloak_user_id, email, username, full_name, avatar, system_role,
            status, language, timezone, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'STUDENT', 'ACTIVE', 'vi', 'Asia/Ho_Chi_Minh', NOW(), NOW())`,
          [
            newId,
            `${provider}-${providerId}`,
            email || null,
            username,
            displayName,
            avatarUrl || null,
          ]
        );
        userId = newId;
      } else {
        userId = user.id;
        // Update avatar if not set
        if (avatarUrl && !user.avatar) {
          await this.pool.query(`UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2`, [
            avatarUrl,
            userId,
          ]);
        }
      }

      // Link OAuth provider
      await this.pool.query(
        `INSERT INTO oauth_providers (user_id, provider, provider_id, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, provider_id) DO NOTHING`,
        [userId, provider, providerId, email || null, displayName, avatarUrl || null]
      );
    }

    await this.pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);

    const user = await this.findById(userId);
    if (!user) throw new Error('OAuth user not found after create');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản không còn hoạt động');

    const tokens = await this.issueTokenPair(user, ipAddress);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  // ── Private: Token helpers ─────────────────────────────────────────────────

  private async issueTokenPair(user: UserRow, ipAddress?: string): Promise<TokenPair> {
    const accessToken = await this.signJwt(user);
    const refreshToken = await this.createRefreshToken(user.id, ipAddress);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '1h',
    };
  }

  private async signJwt(user: UserRow): Promise<string> {
    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      systemRole: user.system_role,
      realm_access: { roles: [user.system_role.toLowerCase()] },
    };
    return this.jwt.signAsync(payload);
  }

  private async createRefreshToken(userId: string, ipAddress?: string): Promise<string> {
    const raw = randomBytes(64).toString('hex');
    const hash = this.hashToken(raw);
    const expiresAt = new Date(
      Date.now() +
        parseInt(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') || '30', 10) * 86400 * 1000
    );
    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, expires_at) VALUES ($1, $2, $3, $4)`,
      [userId, hash, ipAddress || null, expiresAt]
    );
    return raw;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  // ── Private: Password helpers ──────────────────────────────────────────────

  private hashPassword(plain: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(plain, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(plain: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = scryptSync(plain, salt, 64).toString('hex');
    try {
      return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
    } catch {
      return false;
    }
  }

  // ── Private: DB helpers ────────────────────────────────────────────────────

  private async findByIdentity(identity: string): Promise<UserRow | null> {
    const normalized = identity.trim().toLowerCase();
    const res = await this.pool.query<UserRow>(
      `SELECT id, email, username, full_name, phone, system_role, status, password_hash, avatar
       FROM users
       WHERE LOWER(email) = $1 OR LOWER(username) = $1
       LIMIT 1`,
      [normalized]
    );
    return res.rows[0] || null;
  }

  private async findById(id: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserRow>(
      `SELECT id, email, username, full_name, phone, system_role, status, password_hash, avatar
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  private async generateUniqueUsername(displayName: string): Promise<string> {
    const base = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20) || 'user';

    for (let i = 0; i < 10; i++) {
      const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
      const res = await this.pool.query(`SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1`, [
        candidate,
      ]);
      if (!res.rows[0]) return candidate;
    }
    return `${base}${randomBytes(4).toString('hex')}`;
  }

  private toPublicUser(user: UserRow) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      phone: user.phone,
      systemRole: user.system_role,
      avatar: user.avatar,
    };
  }

  // ── Bootstrap admin ────────────────────────────────────────────────────────

  private async ensureAdminAccount(): Promise<void> {
    const username = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_USERNAME') || 'admin';
    const password = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_PASSWORD') || 'admin';
    const email = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_EMAIL') || 'admin@laas.local';
    const fullName = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_FULLNAME') || 'Administrator';

    const existing = await this.pool.query<UserRow>(
      `SELECT id, email, username, full_name, phone, system_role, status, password_hash, avatar
       FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
    );

    if (existing.rows[0]) {
      if (!existing.rows[0].password_hash) {
        await this.pool.query(
          `UPDATE users SET password_hash = $1, system_role = 'ADMIN', status = 'ACTIVE', updated_at = NOW() WHERE id = $2`,
          [this.hashPassword(password), existing.rows[0].id]
        );
      }
      return;
    }

    await this.pool.query(
      `INSERT INTO users (id, keycloak_user_id, email, username, full_name, system_role,
        status, password_hash, language, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', 'ACTIVE', $6, 'vi', 'Asia/Ho_Chi_Minh', NOW(), NOW())`,
      [randomUUID(), `local-${username}`, email, username, fullName, this.hashPassword(password)]
    );

    this.logger.log(`Bootstrap admin account created: ${username}`);
  }
}
