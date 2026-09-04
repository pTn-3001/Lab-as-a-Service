import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract current user from request
 * Assumes JWT has been validated and user attached to request
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);

/**
 * User interface from JWT payload (issued by auth-service, sub = user UUID in DB)
 */
export interface JwtUser {
  sub: string; // user's database UUID
  email: string;
  username?: string;
  systemRole?: string; // 'ADMIN' | 'INSTRUCTOR' | 'STUDENT'
  realm_access?: {
    roles: string[];
  };
}
