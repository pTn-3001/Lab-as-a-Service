import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * JWT Auth Guard
 * Validates JWT token from Keycloak and attaches user to request
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.verifyToken(token);

      const roles = payload.realm_access?.roles ?? this.extractRolesFromPayload(payload);
      const username = payload.preferred_username ?? payload.username;

      request.user = {
        sub: payload.sub,
        email: payload.email,
        username,
        systemRole: payload.systemRole,
        realm_access: { roles },
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async verifyToken(token: string): Promise<any> {
    const secret = this.configService.get<string>('JWT_SECRET') || 'dev-jwt-secret';
    return this.jwtService.verifyAsync(token, {
      secret,
      algorithms: ['HS256'],
    });
  }

  private extractRolesFromPayload(payload: any): string[] {
    const systemRole = payload.systemRole || payload.system_role;
    if (typeof systemRole === 'string') {
      return [systemRole.toLowerCase()];
    }

    return [];
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
