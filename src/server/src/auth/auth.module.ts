import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import type { AppConfig } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * AuthModule wires JWT signing/verification (G2 auth + RBAC foundation).
 *
 * JwtModule is configured asynchronously from validated config and is exported
 * so the globally-registered JwtAuthGuard can resolve JwtService.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const jwt = configService.get<AppConfig['jwt']>('jwt');
        return {
          secret: jwt?.secret,
          // `expiresIn` accepts a numeric (seconds) or ms-style string ("1h").
          signOptions: {
            expiresIn: (jwt?.expiresIn ?? '1h') as `${number}h`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
