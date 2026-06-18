/**
 * Type definitions mirroring the on-disk rule/fixture JSON shapes and the .NET
 * abstractions (IAW.Vdf.Abstractions). These are a faithful TypeScript port of
 * the C# enums and records so the same `rules/*.json` corpus parses 1:1.
 *
 * @remarks Authoritative source: src/backend/IAW.Vdf.Abstractions/*. This module
 * carries no NestJS dependency — it is a pure, embeddable engine.
 */

/** A parsed JSON value (the fact / reference substrate). Mirrors System.Text.Json.Nodes.JsonNode. */
export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A plain JSON object (the fact document root / reference-data root). */
export type JsonObject = { [key: string]: JsonValue };

/**
 * The closed vocabulary of leaf-condition operators, grouped into six families.
 * Mirrors {@link OperatorKind} in OperatorKind.cs exactly (name-for-name).
 */
export type OperatorKind =
  // Presence family
  | 'IsPresent'
  | 'IsAbsent'
  // Equality family
  | 'Equals'
  | 'NotEquals'
  // Membership family
  | 'InSet'
  | 'NotInSet'
  // Comparison family
  | 'GreaterThan'
  | 'LessThan'
  | 'GreaterOrEqual'
  | 'LessOrEqual'
  | 'WithinRange'
  // Matching family (may be reference-backed)
  | 'Matches'
  | 'IsCompatibleWith'
  // Reference-eligibility family (reference-backed)
  | 'IsEligibleFor'
  | 'Exists';

/** How a leaf condition applies across a collection subject. Mirrors {@link Quantifier}. */
export type Quantifier = 'This' | 'Any' | 'Every';

/** The boolean combinator used by a group condition. Mirrors {@link LogicalOperator}. */
export type LogicalOperator = 'All' | 'Any' | 'Not';

/** A terminal condition: an operator applied to a subject path. Mirrors LeafCondition.cs. */
export interface LeafCondition {
  type: 'leaf';
  subject: string;
  operator: OperatorKind;
  /** An inline literal comparand. Mutually exclusive with {@link reference}. */
  value?: JsonValue;
  /** A reference key whose resolved value is the comparand. Mutually exclusive with {@link value}. */
  reference?: string;
  /** Defaults to `'This'`. */
  quantifier?: Quantifier;
}

/** A recursive boolean combinator over child conditions. Mirrors GroupCondition.cs. */
export interface GroupCondition {
  type: 'group';
  logicalOp: LogicalOperator;
  conditions: Condition[];
}

/** A node in a rule's boolean condition tree. */
export type Condition = LeafCondition | GroupCondition;

/** The semantic family an {@link OutcomeType} belongs to. Mirrors {@link OutcomeGroup}. */
export type OutcomeGroup =
  | 'None'
  | 'Validation'
  | 'Workflow'
  | 'Derivation'
  | 'Entity'
  | 'Control';

/** The closed set of decision outcomes. Mirrors {@link OutcomeType} in OutcomeType.cs. */
export type OutcomeType =
  | 'Continue'
  | 'Suppressed'
  | 'CompleteHold'
  | 'PartialHold'
  | 'Warning'
  | 'ComplianceAlert'
  | 'RouteToReview'
  | 'RouteToQueue'
  | 'Escalate'
  | 'SetValue'
  | 'ApplyDefault'
  | 'CalculateValue'
  | 'CreatePlaceholder'
  | 'CreateIncident'
  | 'CreateTask'
  | 'PreventAction'
  | 'AllowAction';

/** Effect-specific parameter map (Target, Value, Destination, Action, SpecimenType, ...). */
export type OutcomeParameters = Record<string, JsonValue>;

/** The effect a rule produces. Mirrors Outcome.cs (Group is derived from Type). */
export interface Outcome {
  type: OutcomeType;
  scope?: string;
  reason?: string;
  severity?: string;
  parameters: OutcomeParameters;
}

/** A corrective action attempted when an assertion fails. Mirrors RecoveryStrategy.cs. */
export interface RecoveryStrategy {
  strategy: string;
  parameters: OutcomeParameters;
}

/** The execution phase a rule runs in. Phases run Derive → Validate → Route. Mirrors {@link RulePhase}. */
export type RulePhase = 'Derive' | 'Validate' | 'Route';

/** The four-part rule anatomy. Mirrors RuleDefinition.cs. */
export interface RuleDefinition {
  key: string;
  name: string;
  description?: string;
  ruleSet?: string;
  priority: number;
  phase: RulePhase;
  enabled: boolean;
  version: number;
  /** ISO-8601 effective date (inclusive). Defaults to MinValue when absent. */
  effectiveDate: string;
  /** ISO-8601 expiry date (exclusive); absent means no expiry. */
  expiryDate?: string;
  appliesWhen?: Condition;
  /** DECISION. Absent is treated as failing through to {@link onFailure} (derivation rules). */
  assert?: Condition;
  onSuccess: Outcome;
  recover?: RecoveryStrategy;
  onFailure: Outcome;
  /**
   * The author's deliberate scope selection (governance metadata; the engine does not
   * evaluate it). Round-trips verbatim through save/get. Mirrors RuleDefinition.Scope
   * in the .NET abstractions and the UI's `RuleScopeDefinition`.
   */
  scope?: { objects: string[]; properties: string[] };
}

/** Well-known recovery strategy identifiers (mirror RecoveryStrategy constants). */
export const RecoveryStrategyName = {
  ApplyDefault: 'apply-default',
  FindAlternateSpecimen: 'find-alternate-specimen',
} as const;

/** A single leaf evaluation record. Mirrors ConditionTrace. */
export interface ConditionTrace {
  subject: string;
  operator: OperatorKind;
  quantifier: Quantifier;
  /** A rendering of the resolved subject value (string-coerced), or null when absent. */
  resolvedLeft: string | null;
  /** A rendering of the resolved comparand (string-coerced or `ref:KEY=...`). */
  resolvedRight: string | null;
  result: boolean;
}

/** A per-rule decision record. Mirrors DecisionTrace. */
export interface DecisionTrace {
  ruleKey: string;
  version: number;
  phase: RulePhase;
  applied: boolean;
  /** Null when the rule did not apply. */
  assertResult: boolean | null;
  conditions: ConditionTrace[];
  recoveryAttempted: boolean;
  recoveryResolved: boolean;
  produced: Outcome | null;
  factsRead: Record<string, string | null>;
  /** Fixed clock instant (ISO-8601). */
  evaluatedAt: string;
}

/** The result of an engine run. Mirrors EvaluationResult. */
export interface EvaluationResult {
  outcomes: Outcome[];
  trace: DecisionTrace[];
  /** The working facts after derivations/recovery write-back (input is never mutated). */
  factsAfter: JsonObject;
}

/** Maps an {@link OutcomeType} to its {@link OutcomeGroup}. Mirrors Outcome.GroupFor. */
export function groupFor(type: OutcomeType): OutcomeGroup {
  switch (type) {
    case 'Continue':
    case 'Suppressed':
      return 'None';
    case 'CompleteHold':
    case 'PartialHold':
    case 'Warning':
    case 'ComplianceAlert':
      return 'Validation';
    case 'RouteToReview':
    case 'RouteToQueue':
    case 'Escalate':
      return 'Workflow';
    case 'SetValue':
    case 'ApplyDefault':
    case 'CalculateValue':
      return 'Derivation';
    case 'CreatePlaceholder':
    case 'CreateIncident':
    case 'CreateTask':
      return 'Entity';
    case 'PreventAction':
    case 'AllowAction':
      return 'Control';
    default:
      return 'None';
  }
}
