import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule exposes GET /health. PrismaService is provided globally
 * (PrismaModule is @Global), so no extra imports are required.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
