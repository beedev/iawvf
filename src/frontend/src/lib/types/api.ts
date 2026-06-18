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

/** A rule definition body is free-form JSON; we keep it as an opaque object for round-tripping. */
export type RuleJson = Record<string, unknown>;

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

// ── Problem Details (RFC 7807) ──────────────────────────────────────────────────────────────────

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}
