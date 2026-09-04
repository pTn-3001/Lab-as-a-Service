import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { matchRoleRule } from '../config/role-rules';
import { isPublicPath } from '../auth/public-paths';
import { AuthenticatedRequest } from '../auth/jwt.middleware';

@Injectable()
export class RbacGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (isPublicPath(req.path)) return true;

    const rule = matchRoleRule(req.path);
    if (!rule) return true;

    const role = req.user?.role;
    if (!role || !rule.roles.includes(role as any)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
