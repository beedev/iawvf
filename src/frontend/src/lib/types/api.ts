/**
 * Typed mirrors of the VDF API DTOs. Property names match the API's camelCase JSON exactly.
 * Enum-like fields are serialized by the API as their string names (e.g. `"Error"`, `"Hold"`),
 * so we model them as string unions where the set is closed, or `string` where it is open.
 *
 * Source of truth: src/backend/IAW.Vdf.Api/Dtos/*.cs
 */

// ── Auth ──────────────────────────────────────────────────────────────────────────────────────

/** The closed set of VDF governance roles. */
export type VdfRole = 'Author' | 'Reviewer' | 'Admin';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string; // ISO-8601
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

export interface EvaluateResponse {
  outcomes: Outcome[];
  trace: DecisionTrace[];
  factsAfter: Record<string, unknown> | null;
}

// ── Vocabulary administration (Admin-only) ──────────────────────────────────────────────────────
//
// Source of truth: src/backend/IAW.Vdf.Api/Dtos/VocabularyAdminDtos.cs and Controllers/VocabularyController.cs.
// This is the GOVERNED, DB-backed catalog of subjects (objects/properties) that authoring + interpretation
// are grounded on. The admin view includes deprecated subjects; the authoring tree (VocabularyResponse) is
// active-only.

/** A subject's lifecycle status. `Deprecated` subjects stay resolvable but are hidden from new authoring. */
export type VocabularySubjectStatus = 'Active' | 'Deprecated';

/** The closed set of subject data types the engine understands. */
export type SubjectDataType = 'String' | 'Number' | 'Date' | 'Boolean' | 'Collection';

/** A single governed vocabulary subject (admin view; includes deprecated rows). */
export interface VocabularySubject {
  /** The dotted fact path (e.g. `order.client.program`, `order.tests[]`). */
  path: string;
  /** The owning object name (first segment, sans trailing `[]`). */
  objectName: string;
  /** The humanized display label. */
  label: string;
  /** The data type: `String|Number|Date|Boolean|Collection`. */
  dataType: string;
  /** An optional description. */
  description?: string | null;
  /** Lifecycle status: `Active` | `Deprecated`. */
  status: VocabularySubjectStatus;
  /** Who created the subject. */
  createdBy: string;
  /** When the subject was created (ISO-8601). */
  createdAt: string;
  /** Who approved the most recent governance action (nullable). */
  approvedBy?: string | null;
  /** When the most recent governance action was approved (nullable, ISO-8601). */
  approvedAt?: string | null;
}

/** An object grouping its properties (admin tree view). */
export interface VocabularyObjectGroup {
  /** The object name (e.g. `order`). */
  name: string;
  /** The humanized object label (e.g. `Order`). */
  label: string;
  /** The properties (subjects) belonging to this object, including deprecated ones. */
  properties: VocabularySubject[];
}

/** The full admin vocabulary listing (objects → properties, all statuses). */
export interface VocabularyAdminList {
  /** The objects with their properties. */
  objects: VocabularyObjectGroup[];
}

/** The request body for creating a new governed subject. */
export interface CreateVocabularySubjectRequest {
  /** The dotted fact path (e.g. `"client.program"`). Required. */
  path: string;
  /** The data type: `String|Number|Date|Boolean|Collection`. Required. */
  dataType: SubjectDataType;
  /** An optional display label; derived from the object name when omitted. */
  label?: string | null;
  /** An optional description. */
  description?: string | null;
}

/** A rule that references a subject path (impact analysis row). */
export interface ReferencingRule {
  /** The rule key. */
  key: string;
  /** The rule name. */
  name: string;
}

/** The impact-analysis response for a subject path. */
export interface VocabularyImpact {
  /** The analyzed subject path. */
  path: string;
  /** The active rules that reference the path. */
  referencingRules: ReferencingRule[];
  /** The number of referencing rules (server-computed). */
  count: number;
}

// ── Problem Details (RFC 7807) ──────────────────────────────────────────────────────────────────

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}
