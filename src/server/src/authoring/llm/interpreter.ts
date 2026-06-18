/**
 * The rule-interpreter contract (N5) and its grounding inputs.
 *
 * An {@link IRuleInterpreter} translates ONE plain-English rule into a structured
 * {@link RuleDefinition} candidate, grounded strictly in the supplied
 * {@link GroundingVocabulary} (the registry-projected legal terms — the source of
 * truth). The model's output is always a *proposal*; the deterministic gate (schema +
 * registry-grounded lint) is the source of truth for validity, so a returned
 * candidate is guaranteed schema-valid and lint-clean against the live registry.
 *
 * Mirrors the .NET `IRuleInterpreter` + `InterpretationResult`
 * (src/backend/IAW.Vdf.Authoring.Llm) with TS-idiomatic shapes.
 */

import { GroundingSubject } from '../vocabulary-linter';

import { RuleDefinition } from '../../vdf/types';

/**
 * The closed grounding vocabulary the model is constrained to. Assembled from the
 * LIVE registry projection (subjects) plus the engine's static operator/outcome
 * vocabulary and the reference-data keys. This is the "no invention" boundary: the
 * model may use ONLY these terms, and must surface a gap for anything missing.
 */
export interface GroundingVocabulary {
  /** Legal subjects (registry-projected `entity.field` paths + types + allowedValues). */
  subjects: readonly GroundingSubject[];
  /** Legal leaf-condition operators (the engine's closed {@link OperatorKind} set). */
  operators: readonly string[];
  /** Legal outcome types (the engine's closed {@link OutcomeType} set). */
  outcomes: readonly string[];
  /** Legal reference-data keys the model may cite for reference-backed comparands. */
  references: readonly string[];
}

/** The outcome of interpreting one natural-language rule. Mirrors `InterpretationResult`. */
export interface InterpretationResult {
  /**
   * The validated rule, or `null` when the sentence could not be grounded (the gate
   * suppresses any candidate that fails schema validation or references unknown terms).
   */
  candidate: RuleDefinition | null;
  /** Confidence in the candidate, 0..1 (0 when suppressed). */
  confidence: number;
  /** Phrases from the input that could not be mapped to a vocabulary term. */
  unmappedPhrases: string[];
  /** Missing concepts / clarifications (propose-new-term gaps). */
  gaps: string[];
  /** Provenance: the original natural-language text. */
  naturalLanguage: string;
  /** Provenance: the interpreter version that produced this result. */
  interpreterVersion: string;
  /** Provenance: the model id used (the literal model for stub/offline runs). */
  model: string;
}

/** Translates plain-English rules into grounded structured candidates. */
export interface IRuleInterpreter {
  /**
   * Interprets one natural-language rule against the grounding vocabulary.
   * @param naturalLanguage The author's plain-English rule.
   * @param grounding The registry-projected closed vocabulary (source of truth).
   * @throws When the interpreter is unavailable (e.g. live model disabled / no key);
   *         callers should fall back to the offline stub rather than fail the request.
   */
  interpret(
    naturalLanguage: string,
    grounding: GroundingVocabulary,
  ): Promise<InterpretationResult>;
}

/** DI token for the default {@link IRuleInterpreter} (the live OpenAI interpreter). */
export const RULE_INTERPRETER = Symbol('RULE_INTERPRETER');
