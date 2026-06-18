/**
 * GATED live smoke test — NOT part of the default offline suite.
 *
 * Runs ONLY when RUN_LIVE_SMOKE=true. It loads the real OpenAI key from the server
 * `.env`, builds the live interpreter, grounds it on a small hand-built vocabulary
 * (no DB required), and calls the model once end-to-end. It prints the structured
 * rule + confidence + gaps (NEVER the key). Failures here (network/quota) must not
 * affect the offline suite, which is why the whole block is skipped by default.
 *
 *   RUN_LIVE_SMOKE=true npx jest src/authoring/llm/__tests__/live-smoke.spec.ts --runInBand
 */

import * as fs from 'fs';
import * as path from 'path';

import { FieldDataType } from '@prisma/client';
import OpenAI from 'openai';

import { ReferenceDataProvider } from '../../../vdf/reference-data';
import { JsonValue } from '../../../vdf/types';
import { SchemaValidator } from '../../schema-validator';
import { GroundingSubject, VocabularyLinter } from '../../vocabulary-linter';
import { GroundingVocabulary } from '../interpreter';
import { OpenAiRuleInterpreter } from '../openai-rule-interpreter';
import { OpenAiOptions } from '../openai.config';
import { RuleInterpretationGate } from '../rule-interpretation-gate';

const ENABLED = process.env.RUN_LIVE_SMOKE === 'true';
const describeMaybe = ENABLED ? describe : describe.skip;

/** Minimal .env parser (KEY=VALUE lines) so the smoke test needs no extra dep. */
function loadEnv(): Record<string, string> {
  const envPath = path.join(__dirname, '..', '..', '..', '..', '.env');
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) {
    return out;
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return out;
}

class StaticReferences implements ReferenceDataProvider {
  constructor(private readonly keys: Set<string>) {}
  resolve(key: string): JsonValue | null {
    return this.keys.has(key) ? [] : null;
  }
  tryResolve(key: string): { found: boolean; value: JsonValue | null } {
    return { found: this.keys.has(key), value: this.keys.has(key) ? [] : null };
  }
  referenceKeys(): string[] {
    return [...this.keys].sort((a, b) => a.localeCompare(b));
  }
}

const SUBJECTS: GroundingSubject[] = [
  { path: 'order.type', dataType: FieldDataType.String, allowedValues: [] },
  {
    path: 'order.qualifyingInitialOrder',
    dataType: FieldDataType.String,
    allowedValues: [],
  },
  {
    path: 'order.performingLab',
    dataType: FieldDataType.String,
    allowedValues: [],
  },
];

const GROUNDING: GroundingVocabulary = {
  subjects: SUBJECTS,
  operators: ['Equals', 'IsPresent', 'IsAbsent', 'InSet', 'IsEligibleFor'],
  outcomes: ['Continue', 'PreventAction', 'CompleteHold', 'ComplianceAlert'],
  references: ['TechnicalFISH'],
};

describeMaybe('LIVE smoke — OpenAiRuleInterpreter end-to-end', () => {
  it('interprets a follow-up rule against the live model', async () => {
    const env = { ...loadEnv(), ...process.env };
    const options: OpenAiOptions = {
      enabled: (env.OPENAI_ENABLED ?? 'false').toLowerCase() === 'true',
      apiKey: env.OPENAI_API_KEY ?? '',
      model: env.OPENAI_MODEL ?? 'gpt-4.1',
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      temperature: 0,
      timeoutMs: 60_000,
    };

    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
    const schema = new SchemaValidator();

    const gateFactory = (
      g: GroundingVocabulary,
    ): Promise<RuleInterpretationGate> =>
      Promise.resolve(
        new RuleInterpretationGate(
          schema,
          new VocabularyLinter(
            g.subjects,
            new StaticReferences(new Set(g.references)),
          ),
        ),
      );

    const interpreter = new OpenAiRuleInterpreter(client, options, gateFactory);

    const result = await interpreter.interpret(
      'When a follow-up order is placed but the patient has no qualifying initial order, prevent submission.',
      GROUNDING,
    );

    // Print the structured output (NEVER the key).

    console.log(
      'LIVE SMOKE RESULT:\n' +
        JSON.stringify(
          {
            candidate: result.candidate,
            confidence: result.confidence,
            unmappedPhrases: result.unmappedPhrases,
            gaps: result.gaps,
            model: result.model,
            interpreterVersion: result.interpreterVersion,
          },
          null,
          2,
        ),
    );

    expect(result).toBeDefined();
    expect(typeof result.confidence).toBe('number');
  }, 90000);
});
