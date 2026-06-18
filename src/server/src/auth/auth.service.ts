import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../config/configuration';
import { verifyDevCredentials } from './dev-users';
import type { JwtPayload } from './auth.types';
import { LoginResponseDto } from './dto/login-response.dto';

/**
 * Authenticates credentials and issues signed JWTs.
 *
 * Security notes:
 *  - Never logs passwords, tokens, or the JWT secret.
 *  - Returns a generic 401 on any credential failure (no user enumeration).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly expiresIn: string;
  private readonly expiresInSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const jwt = this.configService.get<AppConfig['jwt']>('jwt');
    this.expiresIn = jwt?.expiresIn ?? '1h';
    this.expiresInSeconds = parseDurationSeconds(this.expiresIn);
  }

  /**
   * Validates credentials and, on success, returns a signed token plus
   * non-sensitive principal metadata.
   */
  async login(username: string, password: string): Promise<LoginResponseDto> {
    const user = verifyDevCredentials(username, password);
    if (!user) {
      // Log the attempt without the supplied secret.
      this.logger.warn(`Failed login attempt for username="${username}".`);
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload: JwtPayload = {
      sub: user.username,
      username: user.username,
      roles: user.roles,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    this.logger.log(`Issued token for username="${user.username}".`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds,
      username: user.username,
      roles: user.roles,
    };
  }
}

/**
 * Best-effort conversion of a jsonwebtoken-style duration ("1h", "30m", "3600")
 * to seconds, used only to report `expiresIn` to clients.
 */
function parseDurationSeconds(value: string): number {
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    return 3600;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const unitSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return amount * (unitSeconds[unit] ?? 3600);
}
