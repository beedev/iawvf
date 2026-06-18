/**
 * N5 — Live OpenAI NL rule interpreter.
 *
 * Wires the interpreter stack:
 *  - {@link LlmGroundingService} — assembles the live registry-projected grounding.
 *  - {@link RULE_INTERPRETER} — the default {@link IRuleInterpreter}: the live
 *    {@link OpenAiRuleInterpreter}, constructed with an `openai` SDK client (built
 *    from `@nestjs/config`), the resolved options, and an async gate factory that
 *    binds the deterministic {@link RuleInterpretationGate} (N4 SchemaValidator +
 *    registry-grounded VocabularyLinter) to the live projection + DB references.
 *  - {@link StubRuleInterpreter} — the offline deterministic fallback.
 *  - {@link RuleInterpreterService} — the facade callers use (live-with-stub-fallback).
 *
 * The API key is read from config inside the client factory and is never logged.
 * Imports {@link RulesModule} for the projection + reference loader.
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { RulesModule } from '../../rules/rules.module';
import { DbReferenceDataLoader } from '../../rules/db-reference-data.provider';

import { SchemaValidator } from '../schema-validator';
import { VocabularyLinter } from '../vocabulary-linter';

import { GroundingVocabulary, RULE_INTERPRETER } from './interpreter';
import { LlmGroundingService } from './llm-grounding.service';
import { OpenAiRuleInterpreter } from './openai-rule-interpreter';
import { resolveOpenAiOptions } from './openai.config';
import { RuleInterpretationGate } from './rule-interpretation-gate';
import { RuleInterpreterService } from './rule-interpreter.service';
import { StubRuleInterpreter } from './stub-rule-interpreter';

@Module({
  imports: [RulesModule],
  providers: [
    LlmGroundingService,
    StubRuleInterpreter,
    {
      provide: RULE_INTERPRETER,
      inject: [ConfigService, DbReferenceDataLoader],
      useFactory: (
        config: ConfigService,
        referenceLoader: DbReferenceDataLoader,
      ): OpenAiRuleInterpreter => {
        const options = resolveOpenAiOptions(config);
        // The SDK client is constructed even when disabled/keyless; it is only
        // exercised by interpret(), which throws first when the live path is unusable.
        const client = new OpenAI({
          apiKey: options.apiKey || 'unset',
          baseURL: options.baseUrl,
        });
        const schema = new SchemaValidator();
        const gateFactory = async (
          grounding: GroundingVocabulary,
        ): Promise<RuleInterpretationGate> => {
          const references = await referenceLoader.load();
          const linter = new VocabularyLinter(grounding.subjects, references);
          return new RuleInterpretationGate(schema, linter);
        };
        return new OpenAiRuleInterpreter(client, options, gateFactory);
      },
    },
    RuleInterpreterService,
  ],
  exports: [RuleInterpreterService, LlmGroundingService, RULE_INTERPRETER],
})
export class LlmModule {}
