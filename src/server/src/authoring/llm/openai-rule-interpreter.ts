/**
 * The live OpenAI-backed {@link IRuleInterpreter} — the constrained "compiler
 * front-end".
 *
 * A port of {@link ../../../../backend/IAW.Vdf.Authoring.Llm/Interpretation/OpenAiRuleInterpreter.cs}.
 * It grounds the model in the LIVE registry-projected {@link GroundingVocabulary},
 * calls OpenAI Chat Completions with Structured Outputs (`response_format` =
 * `json_schema`, `strict`) and temperature 0 to obtain a typed envelope, then runs
 * every candidate through the deterministic {@link RuleInterpretationGate} (schema +
 * registry-grounded lint) before returning. The model's output is always a
 * *proposal*; the gate is the source of truth for validity.
 *
 * The API key is never logged or surfaced in an error message.
 */

import OpenAI from 'openai';

import { RuleInterpretationGate } from './rule-interpretation-gate';
import {
  GroundingVocabulary,
  IRuleInterpreter,
  InterpretationResult,
} from './interpreter';
import { ModelEnvelope } from './model-envelope';
import { OpenAiOptions, canCallLiveModel } from './openai.config';
import {
  buildSystemPrompt,
  buildUserPrompt,
} from './rule-interpretation-prompt';

/** The interpreter version string, recorded for provenance. */
export const OPENAI_INTERPRETER_VERSION = 'openai-rule-interpreter/1.0.0';

/** Maximum accepted natural-language input length (LLM cost / DoS guard). */
const MAX_NATURAL_LANGUAGE_LENGTH = 4000;

/**
 * The strict JSON schema for the interpretation envelope. The rule is carried as a
 * JSON STRING (`candidateJson`), so the open-ended parts of the rule schema (literal
 * `value`, free-form `parameters`) need not be expressed under strict mode; the
 * deterministic gate validates the rule against the real rule schema afterwards.
 * Under strict mode every property is required and `additionalProperties` is false;
 * `candidateJson` is nullable.
 */
const ENVELOPE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidateJson', 'confidence', 'unmappedPhrases', 'gaps'],
  properties: {
    candidateJson: {
      type: ['string', 'null'],
      description:
        'The full rule object serialized as a JSON string, or null when the sentence cannot be expressed in the vocabulary.',
    },
    confidence: {
      type: 'number',
      description: 'Confidence in the candidate, 0..1.',
    },
    unmappedPhrases: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Phrases from the input that could not be mapped to a vocabulary term.',
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Missing concepts or clarifications; if non-empty, candidateJson is typically null.',
    },
  },
} as const;

export class OpenAiRuleInterpreter implements IRuleInterpreter {
  constructor(
    private readonly client: OpenAI,
    private readonly options: OpenAiOptions,
    private readonly gateFactory: (
      grounding: GroundingVocabulary,
    ) => Promise<RuleInterpretationGate>,
  ) {}

  async interpret(
    naturalLanguage: string,
    grounding: GroundingVocabulary,
  ): Promise<InterpretationResult> {
    if (naturalLanguage === undefined || naturalLanguage.trim() === '') {
      throw new Error('Natural-language rule text must be provided.');
    }

    // Defence-in-depth length guard so the model is never called with an oversized
    // prompt (LLM cost / DoS).
    if (naturalLanguage.length > MAX_NATURAL_LANGUAGE_LENGTH) {
      throw new Error(
        `Natural-language rule text exceeds the maximum of ${MAX_NATURAL_LANGUAGE_LENGTH} characters.`,
      );
    }

    if (!this.options.enabled) {
      throw new Error(
        'The OpenAI interpreter is disabled (OPENAI_ENABLED=false). Fall back to the offline stub interpreter.',
      );
    }
    if (!canCallLiveModel(this.options)) {
      throw new Error(
        'No OpenAI API key is configured (OPENAI_API_KEY). Fall back to the offline stub interpreter.',
      );
    }

    const envelope = await this.callModel(naturalLanguage, grounding);

    // Deterministic gate: schema + registry-grounded lint. The model never decides
    // validity on its own.
    const gate = await this.gateFactory(grounding);
    return gate.validate(envelope, {
      naturalLanguage,
      interpreterVersion: OPENAI_INTERPRETER_VERSION,
      model: this.options.model,
    });
  }

  /**
   * Calls OpenAI Chat Completions with strict Structured Outputs and returns the
   * parsed envelope. Errors (HTTP, timeout, JSON) are surfaced as plain `Error`s
   * with NO secret material.
   */
  private async callModel(
    naturalLanguage: string,
    grounding: GroundingVocabulary,
  ): Promise<ModelEnvelope> {
    const system = buildSystemPrompt(grounding);
    const user = buildUserPrompt(naturalLanguage);

    let content: string | null | undefined;
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.options.model,
          temperature: this.options.temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'vdf_rule_interpretation',
              strict: true,
              schema: ENVELOPE_JSON_SCHEMA,
            },
          },
        },
        { timeout: this.options.timeoutMs },
      );
      content = completion.choices[0]?.message?.content;
    } catch (error) {
      // Surface a sanitised message only — the SDK error text never contains the key.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI request failed: ${message}`);
    }

    if (content === undefined || content === null || content.trim() === '') {
      throw new Error('OpenAI response did not contain message content.');
    }

    return parseEnvelope(content);
  }
}

/** Parses the assistant message content string into a {@link ModelEnvelope}. */
function parseEnvelope(content: string): ModelEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenAI structured output was not valid JSON: ${message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('OpenAI structured output was not a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;

  const candidateJson =
    typeof obj.candidateJson === 'string' ? obj.candidateJson : null;
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0;
  const unmappedPhrases = toStringArray(obj.unmappedPhrases);
  const gaps = toStringArray(obj.gaps);

  return { candidateJson, confidence, unmappedPhrases, gaps };
}

/** Coerces an unknown value into a string[] (filtering non-strings). */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string');
}
