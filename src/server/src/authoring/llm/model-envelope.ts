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
}
