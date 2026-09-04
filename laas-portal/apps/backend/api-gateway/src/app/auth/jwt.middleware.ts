import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';
import { isPublicPath } from './public-paths';
import { RequestUser } from './user.types';

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
  requestId?: string;
}

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    // req.path may be stripped to '/' by Express middleware mounting via forRoutes('*').
    // Use originalUrl for reliable path matching.
    const reqPath = (req.originalUrl ?? '/').split('?')[0];

    if (isPublicPath(reqPath)) {
      return next();
    }

    const auth = req.headers['authorization'];
    let token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

    // Fallback: browser-originated requests send the JWT as a cookie
    if (!token) {
      const cookieHeader = (req.headers['cookie'] as string) ?? '';
      token = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('laas-token='))
        ?.slice('laas-token='.length) ?? null;
    }

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    try {
      const payload = this.jwtService.verify<Record<string, any>>(token);

      req.user = {
        id: payload['sub'],
        role: payload['systemRole'] ?? payload['role'],
        email: payload['email'],
        username: payload['username'],
      };

      // Strip any spoofed x-user-* from the client, then inject from verified token
      delete req.headers['x-user-id'];
      delete req.headers['x-user-role'];
      delete req.headers['x-user-email'];
      delete req.headers['x-user-username'];

      req.headers['x-user-id'] = req.user.id;
      req.headers['x-user-role'] = req.user.role;
      req.headers['x-user-email'] = req.user.email;
      if (req.user.username) req.headers['x-user-username'] = req.user.username;

      return next();
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
