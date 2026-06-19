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

/**
 * A STRUCTURED "missing vocabulary term" proposal: a concrete `entity.field` the
 * Authoring UI can offer to add to the registry inline (then re-interpret) so a
 * phrase that could not be grounded becomes groundable.
 *
 * Primarily SYNTHESIZED by the deterministic {@link RuleInterpretationGate} from a
 * candidate leaf whose subject is unknown to the registry (LINT001), so it is exact
 * and reproducible regardless of what the model claimed.
 */
export interface TermProposal {
  /** The natural-language phrase that motivated the term, when known. */
  phrase?: string;
  /** The proposed entity (first '.'-segment of {@link path}). */
  entity: string;
  /** The proposed field (the remainder of {@link path} after the entity segment). */
  field: string;
  /** The full canonical `entity.field` subject path (trailing `[]` stripped). */
  path: string;
  /** The inferred registry field data type (mirrors Prisma `FieldDataType`). */
  dataType: 'String' | 'Number' | 'Date' | 'Boolean' | 'Collection';
  /** A closed value set inferred from an InSet/Equals literal array, when present. */
  allowedValues?: string[];
  /** Whether {@link entity} is ALREADY a known registry entity (add a field vs. a new entity). */
  entityExists: boolean;
  /** Why this term is being proposed (the rule usage that motivated it). */
  rationale: string;
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
  /**
   * Structured "missing vocabulary term" proposals (default `[]`). When the gate
   * suppressed the candidate because a leaf referenced an unknown subject (LINT001),
   * these tell the UI exactly which `entity.field`(s) to add to make the rule ground.
   */
  termProposals: TermProposal[];
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
