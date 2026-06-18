import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser, JwtPayload } from '../auth.types';
import { Role } from '../roles.enum';

/**
 * Global authentication guard.
 *
 * Verifies a Bearer JWT on every request unless the handler/controller is
 * marked @Public(). On success it attaches a normalized {@link AuthenticatedUser}
 * to `request.user`. Never logs the token value.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header.',
      );
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      // Do not leak the verification error detail.
      throw new UnauthorizedException('Invalid or expired token.');
    }

    request.user = this.toAuthenticatedUser(payload);
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    return value.trim();
  }

  private toAuthenticatedUser(payload: JwtPayload): AuthenticatedUser {
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is Role =>
          Object.values(Role).includes(role),
        )
      : [];
    return {
      userId: payload.sub,
      username: payload.username,
      roles,
    };
  }
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
