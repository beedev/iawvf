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

export interface InterpretResponse {
  /** The compiled candidate rule, or null if the model produced none. */
  candidate: RuleJson | null;
  /** Interpreter confidence in 0..1. */
  confidence: number;
  /** Phrases the interpreter could not map to the controlled vocabulary. */
  unmappedPhrases: string[];
  /** Identified gaps requiring author clarification. */
  gaps: string[];
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
