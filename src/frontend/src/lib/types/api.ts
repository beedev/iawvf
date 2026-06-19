/**
 * Typed mirrors of the VDF API DTOs. Property names match the API's camelCase JSON exactly.
 * Enum-like fields are serialized by the API as their string names (e.g. `"Error"`, `"Hold"`),
 * so we model them as string unions where the set is closed, or `string` where it is open.
 *
 * Source of truth: src/server (NestJS) — auth/dto, vdf/api, authoring/api, rules/api, registry.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────────────────────

/** The closed set of VDF governance roles. */
export type VdfRole = 'Author' | 'Reviewer' | 'Admin';

export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * The raw login response from the Node API. The signed token is `accessToken`, and the lifetime is
 * given as `expiresIn` seconds (not an absolute timestamp). The endpoint client normalizes this into
 * the {@link LoginResponse} the auth layer consumes.
 */
export interface LoginResponseWire {
  accessToken: string;
  tokenType: string;
  expiresIn: number; // seconds
  username: string;
  roles: VdfRole[];
}

/** The normalized login result the auth layer consumes (token + absolute expiry). */
export interface LoginResponse {
  token: string;
  expiresAt: string; // ISO-8601, derived from expiresIn at receipt time
  roles: VdfRole[];
}

// ── Authoring ─────────────────────────────────────────────────────────────────────────────────

export interface InterpretRequest {
  naturalLanguage: string;
  /**
   * Optional object-level scope (object names, e.g. `"specimen"`). When present, the interpreter is
   * constrained to these objects' vocabulary. Mutually preferred below {@link properties}.
   */
  objects?: string[];
  /**
   * Optional property-level scope (full property paths, e.g. `"specimen.fixationTime"`). When present,
   * the interpreter is narrowed to just these properties. Takes precedence over {@link objects}.
   */
  properties?: string[];
}

/**
 * The AUTHORED scope an author deliberately attached to a rule via the Scope selector. Round-trips
 * through save/get on the rule definition under the optional `scope` key (see {@link RuleJson}).
 * `objects` are object names (e.g. `"specimen"`); `properties` are full property paths
 * (e.g. `"specimen.fixationTime"`). Distinct from scope DERIVED from a rule's conditions.
 */
export interface RuleScopeDefinition {
  objects: string[];
  properties: string[];
}

/**
 * A rule definition body is free-form JSON; we keep it as an opaque object for round-tripping.
 *
 * It MAY carry an optional `scope` ({@link RuleScopeDefinition}) — the author's deliberate scope
 * selection, persisted by the backend. We surface it as a known optional key while leaving the rest
 * of the body open.
 */
export type RuleJson = Record<string, unknown> & {
  scope?: RuleScopeDefinition;
};

/**
 * A structured proposal for closing a VOCABULARY GAP: the interpreter could not ground a phrase, so
 * instead of silently failing it suggests the exact registry term that would make the rule resolvable.
 * An Admin can add the proposed term (a new field on an existing entity, or a whole new entity + field)
 * directly from the interpretation panel, after which the rule is re-interpreted against the now-grounded
 * vocabulary.
 *
 * Source of truth: src/server authoring interpret response (`termProposals`).
 */
export interface TermProposal {
  /** The natural-language phrase that could not be grounded (when the interpreter could attribute one). */
  phrase?: string;
  /** The entity (registry key) the proposed term belongs to, e.g. `specimen`. */
  entity: string;
  /** The field name relative to the entity, e.g. `fixationTime` (may be dotted; trailing `[]` = collection). */
  field: string;
  /** The fully-qualified `entity.field` path the proposal would create. */
  path: string;
  /** The coarse data type the interpreter inferred for the field. */
  dataType: FieldDataType;
  /** An optional closed value set the interpreter inferred from the phrase. */
  allowedValues?: string[];
  /** Whether the {@link entity} already exists in the registry (add a field) vs. must be created first. */
  entityExists: boolean;
  /** A short, human-readable justification for why this term is proposed. */
  rationale: string;
}

/**
 * The interpreter's EVALUATION of what adding the proposed terms would do to the result — the evidence
 * that the proposals actually help. The backend only returns {@link TermProposal}s that DEMONSTRABLY
 * improve the result (redundant / no-help ones are filtered out server-side), and pairs them with this
 * delta so the UI can frame the suggestion as a concrete, calm improvement ("raise grounding from X% to
 * Y%") rather than an error to clear.
 *
 * Source of truth: src/server authoring interpret response (`proposalEvaluation`).
 */
export interface ProposalEvaluation {
  /** Grounding confidence of the CURRENT result, before adding the proposed terms (0..1). */
  baselineConfidence: number;
  /** Projected grounding confidence AFTER the proposed terms are added (0..1). */
  projectedConfidence: number;
  /** Whether adding the terms is projected to produce a usable candidate rule. */
  groundsCandidate: boolean;
  /** Whether the current (baseline) result ALREADY has a usable candidate. */
  baselineHadCandidate: boolean;
  /** Count of unmapped phrases BEFORE adding the proposed terms. */
  unmappedBefore: number;
  /** Count of unmapped phrases projected AFTER adding the proposed terms. */
  unmappedAfter: number;
  /** Whether the evaluation concludes the proposals improve the result (the gate for showing them). */
  improves: boolean;
}

/**
 * How completely the sentence grounded — the signal that gates the Save action. `grounded`
 * is savable; `partial` (a candidate exists but a phrase is still unmapped) and `ungrounded`
 * (no candidate) are provisional and must not be saved as-is.
 *
 * Source of truth: src/server authoring interpret response (`grounding`).
 */
export interface GroundingSummary {
  status: 'grounded' | 'partial' | 'ungrounded';
  /** True only for a fully grounded candidate. Save is gated on this. */
  savable: boolean;
  /** When not savable, a one-line reason naming what is unresolved. */
  clarification?: string;
}

export interface InterpretResponse {
  /** The compiled candidate rule, or null if the model produced none. */
  candidate: RuleJson | null;
  /** Interpreter confidence in 0..1. */
  confidence: number;
  /**
   * The grounding verdict. `grounding.savable` gates Save; `grounding.clarification` explains
   * what is unresolved when it is not. Optional/absent for compatibility with API builds that
   * predate the feature — callers should treat an absent value as "grounded when a candidate exists".
   */
  grounding?: GroundingSummary;
  /** Phrases the interpreter could not map to the controlled vocabulary. */
  unmappedPhrases: string[];
  /** Identified gaps requiring author clarification. */
  gaps: string[];
  /**
   * Structured, actionable proposals for terms that would close the vocabulary gaps. ALREADY FILTERED
   * server-side to only the terms that DEMONSTRABLY improve the result — empty when nothing would help.
   * Optional/absent for forward/backward compatibility with API builds that predate the feature.
   */
  termProposals?: TermProposal[];
  /**
   * The evaluation delta for {@link termProposals}: what adding them is projected to do to grounding
   * confidence and candidate completeness. Present alongside non-empty proposals; null/absent when the
   * backend found nothing that helps. Optional for forward/backward compatibility.
   */
  proposalEvaluation?: ProposalEvaluation | null;
  /**
   * EXISTING registry properties relevant to the author's text (deterministic match — never invented).
   * Empty means "unable to suggest": nothing in the controlled vocabulary matched. Optional/absent for
   * compatibility with API builds that predate the suggester.
   */
  vocabularySuggestions?: VocabularySuggestion[];
}

/** A relevant EXISTING vocabulary property suggested for the author's text (never invented). */
export interface VocabularySuggestion {
  /** The existing registry property path, e.g. `specimen.bodySite`. */
  path: string;
  /** The property data type name (e.g. `String`, `Number`). */
  dataType: string;
  /** The text tokens that matched this property (the reason it was suggested). */
  matched: string[];
}

/** A single addressable property within a vocabulary object (e.g. `specimen.fixationTime`). */
export interface VocabularyProperty {
  /** Fully-qualified path used as a rule `subject` / interpret `properties` entry. */
  path: string;
  /** Property name relative to its object (may be dotted, e.g. `client.nyStatus`). */
  name: string;
  /** Coarse data type for display (e.g. `Number`, `String`, `Date`, `Boolean`). */
  dataType: string;
}

/** A top-level domain object (specimen, order, test…) and its addressable properties. */
export interface VocabularyObject {
  /** Object identifier used as an interpret `objects` entry (e.g. `specimen`). */
  name: string;
  /** Human-facing label (e.g. `Specimen`). */
  label: string;
  properties: VocabularyProperty[];
}

/** The controlled authoring vocabulary tree plus the operator and outcome catalogs. */
export interface VocabularyResponse {
  objects: VocabularyObject[];
  operators: string[];
  outcomes: string[];
}

export type LintSeverity = 'Error' | 'Warning';

export interface LintFinding {
  severity: LintSeverity;
  code: string;
  message: string;
  path: string;
}

export interface LintReport {
  /** True when there are no Error-severity findings. */
  isValid: boolean;
  findings: LintFinding[];
}

export interface ParaphraseResponse {
  paraphrase: string;
}

export interface DryRunHit {
  fixtureName: string;
  applied: boolean;
  produced: string | null;
  reason: string | null;
}

export interface DryRunResponse {
  evaluated: number;
  hits: DryRunHit[];
}

export interface RuleJsonRequest {
  ruleJson: RuleJson;
}

// ── Rules repository ──────────────────────────────────────────────────────────────────────────

export interface RuleSummary {
  key: string;
  name: string;
  description: string | null;
  ruleSet: string | null;
  phase: string;
  priority: number;
  enabled: boolean;
  version: number;
  effectiveDate: string;
  expiryDate: string | null;
}

export interface RuleDetail {
  summary: RuleSummary;
  ruleJson: RuleJson | null;
  authoredBy: string | null;
  authorNl: string | null;
  interpreterVersion: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface CreateRuleRequest {
  ruleJson: RuleJson;
  authorNl?: string | null;
  interpreterVersion?: string | null;
}

export interface ApproveRequest {
  approver: string;
}

export interface RuleMutationResponse {
  key: string;
  version: number | null;
  message: string;
}

// ── Evaluation ────────────────────────────────────────────────────────────────────────────────

export type TriggerType = 'OrderEvent' | 'TimeSchedule' | 'DecisionReturned';

export interface EvaluateRequest {
  factsJson: Record<string, unknown>;
  ruleSet?: string | null;
  triggerType?: TriggerType | null;
  /**
   * When true, a registry validation failure blocks evaluation (422). Default false: the API returns
   * outcomes alongside a {@link ValidationBlock} so the UI can surface mismatches non-destructively.
   */
  strict?: boolean | null;
}

export interface Outcome {
  type: string;
  group: string;
  scope: string | null;
  reason: string | null;
  severity: string | null;
  parameters: Record<string, unknown>;
  /**
   * The key of the rule that produced this outcome (e.g. `"PM17"`), or null/absent when it could not
   * be attributed. Added by the N6 API's outcome enrichment — optional for forward/backward compat.
   */
  ruleKey?: string | null;
  /**
   * The human-readable name of the producing rule (e.g. `"Circled H&E required for Technical FISH on
   * FFPE"`), or null/absent when unknown. Pairs with {@link ruleKey} for the verdict's rule list.
   */
  ruleName?: string | null;
}

export interface ConditionTrace {
  subject: string;
  operator: string;
  resolvedLeft: string | null;
  resolvedRight: string | null;
  result: boolean;
}

export interface DecisionTrace {
  ruleKey: string;
  /** Human-readable rule name (e.g. "Circled H&E required for Technical FISH on FFPE"), or null when unknown. */
  ruleName?: string | null;
  version: number;
  phase: string;
  applied: boolean;
  assertResult: boolean | null;
  conditions: ConditionTrace[];
  produced: Outcome | null;
}

/** A single registry validation error attached to an evaluation (entity-/path-scoped, no PHI). */
export interface ValidationError {
  entity: string;
  path: string;
  message: string;
}

/**
 * The registry validation block the Node API attaches to every evaluation. When `valid` is false the
 * `errors` describe the facts that did not match the registry schema; the outcomes are still returned
 * (unless the request was `strict`), so the UI surfaces a non-blocking banner.
 */
export interface ValidationBlock {
  valid: boolean;
  errors: ValidationError[];
}

export interface EvaluateResponse {
  outcomes: Outcome[];
  trace: DecisionTrace[];
  factsAfter: Record<string, unknown> | null;
  /**
   * The registry validation findings for the submitted facts. Optional for forward/backward
   * compatibility — a missing block is treated as "valid" (no banner).
   */
  validation?: ValidationBlock;
}

// ── Entity registry (Admin-only vocabulary administration) ──────────────────────────────────────
//
// Source of truth: src/server/src/registry/registry.controller.ts and its DTOs.
// The registry is the typed, governed model behind the controlled vocabulary: ENTITIES (top-level
// fact objects, e.g. `specimen`) own FIELDS (their addressable properties, e.g. `fixationTime`).
// Fields are added by SELECTING an existing entity — never by typing a free path — which is the
// fix for the old "Kit / kit" duplicate. Entity keys are unique case-insensitively (409 on dup).

/** A registry artifact's lifecycle status. `Deprecated` stays resolvable but is hidden from authoring. */
export type RegistryStatus = 'Active' | 'Deprecated';

/** The closed set of field data types the engine understands. */
export type FieldDataType = 'String' | 'Number' | 'Date' | 'Boolean' | 'Collection';

/** A single field on an entity (one addressable fact property). */
export interface RegistryField {
  id: string;
  entityId: string;
  /** Field name relative to its entity (may be dotted, e.g. `client.nyStatus`; trailing `[]` = collection). */
  name: string;
  dataType: FieldDataType;
  required: boolean;
  /** Closed set of permitted values (enum). Empty means any value of the data type. */
  allowedValues: string[];
  description: string | null;
  status: RegistryStatus;
}

/** A top-level registry entity together with its fields (the standard listing projection). */
export interface RegistryEntity {
  id: string;
  /** Canonical lower-case key (e.g. `specimen`). Unique case-insensitively. */
  key: string;
  label: string;
  description: string | null;
  status: RegistryStatus;
  createdBy: string;
  fields: RegistryField[];
}

/** Request body for creating a registry entity. 409 on a case-insensitive duplicate key. */
export interface CreateEntityRequest {
  /** A single identifier segment matching `/^[a-zA-Z][a-zA-Z0-9]*$/`. Stored canonical lower-case. */
  key: string;
  /** Optional display label; derived from the key when omitted. */
  label?: string | null;
  /** Optional description. */
  description?: string | null;
}

/** Request body for adding a field to an existing (selected) entity. */
export interface AddFieldRequest {
  /** Field name relative to the entity. Dotted segments allowed; optional trailing `[]`. */
  name: string;
  dataType: FieldDataType;
  /** Whether the field is required. Defaults to false. */
  required?: boolean;
  /** Optional closed value set (enum). */
  allowedValues?: string[];
  /** Optional description. */
  description?: string | null;
}

/** Request body for runtime fact validation against the registry. */
export interface ValidateFactsRequest {
  facts: Record<string, unknown>;
}

/** The result of validating a fact document against the registry. */
export interface FactValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ── Problem Details (RFC 7807) ──────────────────────────────────────────────────────────────────

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  [key: string]: unknown;
}
