import { Module } from '@nestjs/common';

import { RulesModule } from '../rules/rules.module';

import { AuthoringService } from './authoring.service';

/**
 * N4 — Authoring tooling.
 *
 * Provides {@link AuthoringService} (schema validation, registry-grounded
 * linting, round-trip paraphrasing, and read-only dry-run preview). Imports
 * {@link RulesModule} for the registry-projected grounding vocabulary
 * ({@link VocabularyProjectionService}) and the DB-backed reference provider
 * ({@link DbReferenceDataLoader}). HTTP controllers land in N6.
 */
@Module({
  imports: [RulesModule],
  providers: [AuthoringService],
  exports: [AuthoringService],
})
export class AuthoringModule {}
