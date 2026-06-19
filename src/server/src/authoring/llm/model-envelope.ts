/**
 * The raw structured-output envelope the model returns.
 *
 * A faithful port of {@link ../../../../backend/IAW.Vdf.Authoring.Llm/Interpretation/ModelEnvelope.cs}.
 * The rule itself is carried as a JSON STRING in {@link candidateJson} (rather than
 * an inline object) so the deterministic gate can schema-validate and lint it with
 * the existing N4 tooling before it is ever treated as a real rule. A `null`/empty
 * {@link candidateJson} means the model declined to produce a candidate (a gap).
 */
export interface ModelEnvelope {
  /** The full rule object serialized as a JSON string, or `null` when no candidate. */
  candidateJson: string | null;
  /** The model's self-reported confidence in the candidate, 0..1. */
  confidence: number;
  /** Phrases from the input the model could not map to the vocabulary. */
  unmappedPhrases: string[];
  /** Gaps the model surfaced (missing concepts / clarifications needed). */
  gaps: string[];
  /**
   * Structured missing-vocabulary-term proposals the model surfaced when a phrase
   * could not be grounded (the PRIMARY path when a well-behaved model DECLINES to
   * produce a candidate). The gate normalises these (derives the canonical path and
   * `entityExists`) and merges them with any it synthesizes from candidate leaves.
   */
  termProposals?: ModelTermProposal[];
}

/**
 * A raw, model-emitted term proposal. The model supplies the semantic fields; the
 * deterministic gate derives the canonical `path` and registry-checked `entityExists`
 * before exposing it as a {@link ../interpreter.TermProposal}.
 */
export interface ModelTermProposal {
  /** The natural-language phrase that motivated the term, when the model provides it. */
  phrase?: string;
  /** The entity the model believes the missing concept belongs to. */
  entity: string;
  /** A camelCase field name for the missing concept. */
  field: string;
  /** The inferred data type; defaults to `String` when the model omits it. */
  dataType?: 'String' | 'Number' | 'Date' | 'Boolean' | 'Collection';
  /** A closed value set when the concept is enumerated. */
  allowedValues?: string[];
  /** Why this term is being proposed. */
  rationale?: string;
}
