import { Role } from './roles.enum';

/**
 * Claims embedded in issued JWTs. `sub` is the subject (username); `roles`
 * carries the principal's granted roles.
 */
export interface JwtPayload {
  sub: string;
  username: string;
  roles: Role[];
}

/**
 * The authenticated principal attached to the request by JwtAuthGuard.
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  roles: Role[];
}
