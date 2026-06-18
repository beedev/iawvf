import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth.types';
import { Role } from '../roles.enum';

/**
 * Authorization guard. Runs after JwtAuthGuard has populated request.user.
 *
 * If a handler/controller declares @Roles(...), the principal must hold at
 * least one of the listed roles. Routes without @Roles() pass through
 * (authentication alone is sufficient).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user: AuthenticatedUser | undefined = request.user;
    const granted = user?.roles ?? [];

    const allowed = requiredRoles.some((role) => granted.includes(role));
    if (!allowed) {
      throw new ForbiddenException('Insufficient role for this resource.');
    }
    return true;
  }
}
