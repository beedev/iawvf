import { SetMetadata } from '@nestjs/common';
import { Role } from '../roles.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to principals holding at least one of the given roles.
 * Enforced by RolesGuard. Requires authentication (not @Public).
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
