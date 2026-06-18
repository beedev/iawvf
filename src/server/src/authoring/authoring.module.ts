import { Module } from '@nestjs/common';

import { RulesModule } from '../rules/rules.module';

import { AuthoringService } from './authoring.service';
import { LlmModule } from './llm/llm.module';

/**
 * N4/N5 — Authoring tooling + LLM rule interpreter.
 *
 * Provides {@link AuthoringService} (schema validation, registry-grounded
 * linting, round-trip paraphrasing, and read-only dry-run preview) and imports
 * {@link LlmModule} (N5 — the live OpenAI NL rule interpreter + offline stub +
 * deterministic gate). Imports {@link RulesModule} for the registry-projected
 * grounding vocabulary ({@link VocabularyProjectionService}) and the DB-backed
 * reference provider ({@link DbReferenceDataLoader}). HTTP controllers land in N6.
 */
@Module({
  imports: [RulesModule, LlmModule],
  providers: [AuthoringService],
  exports: [AuthoringService, LlmModule],
})
export class AuthoringModule {}
