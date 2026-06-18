import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../roles.enum';
import type { AuthenticatedUser } from '../auth.types';

const contextFor = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guardWith = (required: Role[] | undefined): RolesGuard => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows when no roles are required', () => {
    const guard = guardWith(undefined);
    expect(
      guard.canActivate(contextFor({ userId: 'a', username: 'a', roles: [] })),
    ).toBe(true);
  });

  it('allows when the principal holds a required role', () => {
    const guard = guardWith([Role.Admin]);
    const user: AuthenticatedUser = {
      userId: 'admin',
      username: 'admin',
      roles: [Role.Admin],
    };
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('forbids when the principal lacks every required role', () => {
    const guard = guardWith([Role.Admin]);
    const user: AuthenticatedUser = {
      userId: 'author',
      username: 'author',
      roles: [Role.Author],
    };
    expect(() => guard.canActivate(contextFor(user))).toThrow(
      ForbiddenException,
    );
  });
});
