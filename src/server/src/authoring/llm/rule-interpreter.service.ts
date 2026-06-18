/**
 * The high-level interpreter facade the authoring surface (N6) will call.
 *
 * It assembles the live {@link GroundingVocabulary}, attempts the default
 * {@link IRuleInterpreter} (the live OpenAI interpreter), and — when the live path is
 * unavailable (disabled / no key / network error) — transparently falls back to the
 * deterministic offline {@link StubRuleInterpreter}. It NEVER leaks secrets: a live
 * failure degrades to the stub rather than surfacing a 500 with provider detail.
 */

import { Injectable, Logger } from '@nestjs/common';

import { LlmGroundingService } from './llm-grounding.service';
import { RULE_INTERPRETER, InterpretationResult } from './interpreter';
import { Inject } from '@nestjs/common';
import { IRuleInterpreter } from './interpreter';
import { StubRuleInterpreter } from './stub-rule-interpreter';

@Injectable()
export class RuleInterpreterService {
  private readonly logger = new Logger(RuleInterpreterService.name);

  constructor(
    private readonly grounding: LlmGroundingService,
    @Inject(RULE_INTERPRETER)
    private readonly primary: IRuleInterpreter,
    private readonly stub: StubRuleInterpreter,
  ) {}

  /**
   * Interprets one natural-language rule against the live registry grounding. Uses the
   * primary (live) interpreter; on any failure, falls back to the offline stub so the
   * caller always receives a structured result.
   */
  async interpret(naturalLanguage: string): Promise<InterpretationResult> {
    const vocabulary = await this.grounding.build();
    try {
      return await this.primary.interpret(naturalLanguage, vocabulary);
    } catch (error) {
      // Log the reason (never the key — the interpreter sanitises its messages) and
      // degrade gracefully to the offline stub.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Live interpreter unavailable; falling back to offline stub. Reason: ${message}`,
      );
      return this.stub.interpret(naturalLanguage, vocabulary);
    }
  }
}
