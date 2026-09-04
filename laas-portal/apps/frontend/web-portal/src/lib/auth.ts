'use client';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'laas:access-token';
const REFRESH_KEY = 'laas:refresh-token';
const USER_KEY = 'laas:user';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SystemRole = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  phone: string | null;
  systemRole: SystemRole;
  avatar: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function saveAuth(result: AuthResult): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, result.accessToken);
  localStorage.setItem(REFRESH_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  // Cookie cho Next.js middleware (route protection)
  try {
    const payload = parseJwt(result.accessToken);
    const maxAge = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    document.cookie = `laas-token=${result.accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    document.cookie = `laas-token=${result.accessToken}; path=/; SameSite=Lax`;
  }
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = 'laas-token=; path=/; max-age=0; SameSite=Lax';
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  const token = getAccessToken();
  if (!token) return false;
  try {
    const payload = parseJwt(token);
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

let _refreshPromise: Promise<string | null> | null = null;

export async function ensureValidToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const payload = parseJwt(token);
    // Still valid with 60-second buffer
    if (payload.exp * 1000 > Date.now() + 60_000) return token;
  } catch {
    return null;
  }

  // Deduplicate concurrent refresh calls
  if (!_refreshPromise) {
    _refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;
      try {
        const result = await apiRefresh(refreshToken);
        const user = getStoredUser();
        if (user) saveAuth({ ...result, user });
        else {
          localStorage.setItem(TOKEN_KEY, result.accessToken);
          localStorage.setItem(REFRESH_KEY, result.refreshToken);
        }
        return result.accessToken;
      } catch {
        clearAuth();
        return null;
      }
    })().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

// ─── JWT parsing (client-side, no verification) ───────────────────────────────

function parseJwt(token: string): { sub: string; exp: number; systemRole: SystemRole } {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(json);
}

// ─── Workspace redirect ────────────────────────────────────────────────────────

export function getWorkspaceUrl(role: SystemRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'INSTRUCTOR':
      return '/instructor';
    default:
      return '/student';
  }
}

export function getWorkspaceUrlForCurrentUser(): string | null {
  const user = getStoredUser();
  if (!user) return null;
  return getWorkspaceUrl(user.systemRole);
}

// ─── API calls (via Next.js BFF) ─────────────────────────────────────────────

const AUTH_BFF = '/api/auth';

async function authFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${AUTH_BFF}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `Request failed: ${res.status}`);
  }
  return json as T;
}

export async function apiLogin(identity: string, password: string): Promise<AuthResult> {
  return authFetch<AuthResult>('/login', {
    method: 'POST',
    body: JSON.stringify({ username: identity, password }),
  });
}

export async function apiRegister(dto: {
  fullName: string;
  email: string;
  username: string;
  password: string;
  phone?: string;
}): Promise<AuthResult> {
  return authFetch<AuthResult>('/register', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function apiLogout(refreshToken: string): Promise<void> {
  await authFetch('/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logout(): Promise<void> {
  const rt = getRefreshToken();
  clearAuth();
  if (rt) {
    try {
      await apiLogout(rt);
    } catch {
      // ignore network errors on logout
    }
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

export async function apiRefresh(refreshToken: string): Promise<Pick<AuthResult, 'accessToken' | 'refreshToken' | 'tokenType' | 'expiresIn'>> {
  return authFetch('/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function apiForgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  return authFetch('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return authFetch('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

// Google / Facebook OAuth — redirect browser to auth-service
export function redirectToGoogle(): void {
  window.location.href = `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:3001'}/api/auth/google`;
}

export function redirectToFacebook(): void {
  window.location.href = `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:3001'}/api/auth/facebook`;
}
