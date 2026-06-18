import { Module } from '@nestjs/common';
import { ProbeController } from './probe.controller';

/**
 * THROWAWAY module hosting the guard-exercising probe endpoints.
 * Delete alongside ProbeController once real feature modules land.
 */
@Module({
  controllers: [ProbeController],
})
export class ProbeModule {}
