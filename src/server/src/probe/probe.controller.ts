import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/roles.enum';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * THROWAWAY probe controller used only to exercise the auth/RBAC guards in
 * tests and manual verification. Remove once real feature controllers exist.
 *
 *   GET /api/_probe        -> any authenticated principal
 *   GET /api/_probe/admin  -> Admin role required
 */
@ApiTags('_probe')
@ApiBearerAuth()
@Controller('api/_probe')
export class ProbeController {
  @Get()
  @ApiOperation({ summary: '[dev] Any authenticated principal.' })
  whoami(@CurrentUser() user: AuthenticatedUser): {
    username: string;
    roles: Role[];
  } {
    return { username: user.username, roles: user.roles };
  }

  @Get('admin')
  @Roles(Role.Admin)
  @ApiOperation({ summary: '[dev] Admin-only resource.' })
  adminOnly(@CurrentUser() user: AuthenticatedUser): {
    username: string;
    message: string;
  } {
    return { username: user.username, message: 'admin access granted' };
  }
}
