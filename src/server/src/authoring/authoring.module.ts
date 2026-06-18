import { Module } from '@nestjs/common';

import { RulesModule } from '../rules/rules.module';
import { RulesController } from '../rules/api/rules.controller';

import { AuthoringController } from './api/authoring.controller';
import { AuthoringService } from './authoring.service';
import { LlmModule } from './llm/llm.module';

/**
 * N4/N5/N6 — Authoring tooling + LLM rule interpreter + their HTTP surface.
 *
 * Provides {@link AuthoringService} (schema validation, registry-grounded linting,
 * round-trip paraphrasing, read-only dry-run preview) and imports {@link LlmModule}
 * (N5 — the live OpenAI NL rule interpreter + offline stub + deterministic gate) and
 * {@link RulesModule} (N3 — the registry-projected grounding vocabulary, DB reference
 * provider, and the governed rule repository).
 *
 * Hosts the N6 authoring + governed-rules controllers: {@link AuthoringController}
 * (`/api/authoring/*`) and {@link RulesController} (`/api/rules/*`). The rules
 * controller lives here because its create/version lint gate depends on the
 * registry-grounded {@link AuthoringService}.
 */
@Module({
  imports: [RulesModule, LlmModule],
  controllers: [AuthoringController, RulesController],
  providers: [AuthoringService],
  exports: [AuthoringService, LlmModule],
})
export class AuthoringModule {}
