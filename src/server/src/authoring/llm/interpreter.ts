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

/**
 * The verdict of a single SANDBOX re-interpretation that probes whether adding the
 * (deduped) {@link TermProposal}s to the grounding vocabulary would DEMONSTRABLY
 * improve the interpretation — the evidence the Authoring UI uses to decide whether
 * to surface the proposals at all (vs. "no vocabulary change would help; the current
 * candidate is your result"). Produced by exactly ONE extra interpret call; never a
 * loop.
 */
export interface ProposalEvaluation {
  /** Confidence of the BASE interpretation (current vocabulary). */
  baselineConfidence: number;
  /** Confidence of the SANDBOX interpretation (vocabulary + proposed terms). */
  projectedConfidence: number;
  /** Whether the SANDBOX interpretation produced a (non-null) candidate. */
  groundsCandidate: boolean;
  /** Whether the BASE interpretation already had a (non-null) candidate. */
  baselineHadCandidate: boolean;
  /** Count of unmapped phrases BEFORE adding the proposed terms. */
  unmappedBefore: number;
  /** Count of unmapped phrases AFTER adding the proposed terms (sandbox). */
  unmappedAfter: number;
  /**
   * Whether adding the proposed terms DEMONSTRABLY improves the interpretation:
   * the sandbox grounds a candidate AND (the baseline had none, OR confidence rose
   * meaningfully, OR fewer phrases were left unmapped).
   */
  improves: boolean;
}

/**
 * How completely the sentence grounded in the registry vocabulary — the signal the UI
 * uses to decide whether the candidate may be SAVED:
 *  - `grounded`   — a candidate was produced and every phrase mapped to a term → savable;
 *  - `partial`    — a candidate exists but some phrase(s) are still unmapped, so the rule
 *                   does not yet fully represent the author's intent → provisional, NOT savable;
 *  - `ungrounded` — no candidate (the gate suppressed it) → not savable.
 */
export type GroundingStatus = 'grounded' | 'partial' | 'ungrounded';

/**
 * The deterministic grounding verdict attached to every {@link InterpretationResult}.
 * `savable` is true ONLY for a fully grounded candidate. When false, `clarification`
 * is a single human-readable line naming exactly what is unresolved (the unmapped
 * phrases, or why no candidate was produced) so the author knows what to fix.
 */
export interface GroundingSummary {
  status: GroundingStatus;
  /** True only when `status === 'grounded'`. The Save action is gated on this. */
  savable: boolean;
  /** When not savable, a one-line reason naming what is unresolved. */
  clarification?: string;
}

/** Upper bound on confidence for a partially-grounded (provisional) candidate. */
export const PARTIAL_GROUNDING_CONFIDENCE_CAP = 0.4;

/**
 * Derives the deterministic {@link GroundingSummary} from a candidate and the residual
 * unmapped phrases. The single place that decides whether a rule may be SAVED, shared by
 * the live gate and the offline stub so both agree:
 *  - no candidate           → `ungrounded` (suppressed) — not savable;
 *  - candidate + unmapped    → `partial`  (provisional)  — not savable;
 *  - candidate + none left   → `grounded`                — savable.
 */
export function summarizeGrounding(
  candidate: RuleDefinition | null,
  unmappedPhrases: string[],
): GroundingSummary {
  if (candidate === null) {
    return {
      status: 'ungrounded',
      savable: false,
      clarification:
        'The sentence could not be grounded in the controlled vocabulary, so no rule was produced. Add the missing term(s) below or rephrase, then re-interpret.',
    };
  }
  if (unmappedPhrases.length > 0) {
    const quoted = unmappedPhrases.map((p) => `"${p}"`).join(', ');
    const one = unmappedPhrases.length === 1;
    return {
      status: 'partial',
      savable: false,
      clarification:
        `This rule is provisional — the ${one ? 'phrase' : 'phrases'} ${quoted} ${one ? "isn't" : "aren't"} grounded in the vocabulary, ` +
        'so the candidate may not fully capture your intent. Add the missing term(s) below or rephrase, then re-interpret before saving.',
    };
  }
  return { status: 'grounded', savable: true };
}

/** The outcome of interpreting one natural-language rule. Mirrors `InterpretationResult`. */
export interface InterpretationResult {
  /**
   * The validated rule, or `null` when the sentence could not be grounded (the gate
   * suppresses any candidate that fails schema validation or references unknown terms).
   */
  candidate: RuleDefinition | null;
  /** Confidence in the candidate, 0..1 (0 when suppressed, capped when partial). */
  confidence: number;
  /**
   * Whether the sentence grounded fully, partially, or not at all — and whether the
   * candidate may be saved. Surfaced so a partially-grounded rule cannot masquerade as
   * a high-confidence, savable one (see {@link GroundingSummary}).
   */
  grounding: GroundingSummary;
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

/**
 * An {@link InterpretationResult} enriched with the SANDBOX {@link ProposalEvaluation}.
 * `proposalEvaluation` is `null` when there were no proposals to evaluate (so no
 * sandbox call was made); non-null when a single sandbox re-interpretation ran. When
 * `proposalEvaluation.improves` is false the {@link InterpretationResult.termProposals}
 * are dropped (`[]`) — the proposals would not help, so the current candidate stands.
 */
export interface EvaluatedInterpretationResult extends InterpretationResult {
  proposalEvaluation: ProposalEvaluation | null;
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
