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
