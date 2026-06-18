import { Module } from '@nestjs/common';
import { FactValidationService } from './fact-validation.service';
import { RegistryController } from './registry.controller';
import { RegistrySeeder } from './registry.seeder';
import { RegistryService } from './registry.service';

/**
 * N1 — Entity Schema Registry.
 *
 * Owns the governed CRUD over entities/fields (RegistryService), the idempotent
 * canonical seeder (RegistrySeeder), and runtime fact validation against
 * compiled JSON schemas (FactValidationService). PrismaService is provided
 * globally by PrismaModule.
 */
@Module({
  controllers: [RegistryController],
  providers: [RegistryService, FactValidationService, RegistrySeeder],
  exports: [RegistryService, FactValidationService],
})
export class RegistryModule {}
