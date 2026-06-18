import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configuration, { type AppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { buildLoggerConfig } from './common/logging/logger.config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ProbeModule } from './probe/probe.module';
import { RegistryModule } from './registry/registry.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

/**
 * Application root.
 *
 * Global guards run in registration order: JwtAuthGuard (authentication, honors
 * @Public) then RolesGuard (authorization, honors @Roles).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<AppConfig['isProduction']>('isProduction') ?? false;
        return buildLoggerConfig(isProduction);
      },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    ProbeModule,
    RegistryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
