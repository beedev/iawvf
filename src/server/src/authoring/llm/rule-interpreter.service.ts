/**
 * The high-level interpreter facade the authoring surface (N6) calls.
 *
 * It assembles the live {@link GroundingVocabulary} (optionally narrowed to a scoped
 * subject subset), attempts the default {@link IRuleInterpreter} (the live OpenAI
 * interpreter), and — when the live path is unavailable (disabled / no key / network
 * error) — transparently falls back to the deterministic offline
 * {@link StubRuleInterpreter}. It NEVER leaks secrets: a live failure degrades to the
 * stub rather than surfacing a 500 with provider detail.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import { LlmGroundingService } from './llm-grounding.service';
import {
  GroundingVocabulary,
  IRuleInterpreter,
  InterpretationResult,
  RULE_INTERPRETER,
} from './interpreter';
import { StubRuleInterpreter } from './stub-rule-interpreter';

import { GroundedSubject } from '../../rules/vocabulary-projection.service';

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
   * Interprets one natural-language rule against the FULL live registry grounding.
   * Uses the primary (live) interpreter; on any failure, falls back to the offline
   * stub so the caller always receives a structured result.
   */
  async interpret(naturalLanguage: string): Promise<InterpretationResult> {
    const vocabulary = await this.grounding.build();
    return this.run(naturalLanguage, vocabulary);
  }

  /**
   * Interprets one natural-language rule grounded only on {@link scopedSubjects} (a
   * registry-projected subset chosen by the author's scope picker). The operator,
   * outcome, and reference vocabularies remain the full engine set — only the subject
   * surface is narrowed.
   */
  async interpretScoped(
    naturalLanguage: string,
    scopedSubjects: readonly GroundedSubject[],
  ): Promise<InterpretationResult> {
    const vocabulary = await this.grounding.buildScoped(scopedSubjects);
    return this.run(naturalLanguage, vocabulary);
  }

  private async run(
    naturalLanguage: string,
    vocabulary: GroundingVocabulary,
  ): Promise<InterpretationResult> {
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
