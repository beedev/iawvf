/**
 * Rule (de)serialization. Parses the exact `rules/*.json` shape produced by the
 * .NET RuleSerializer + ConditionJsonConverter + OutcomeJsonConverter +
 * RecoveryStrategyJsonConverter. Operator/quantifier/logicalOp/phase/outcome-type
 * enums are matched case-insensitively (mirroring Enum.TryParse(ignoreCase: true)).
 */

import {
  Condition,
  GroupCondition,
  LeafCondition,
  LogicalOperator,
  Outcome,
  OutcomeParameters,
  OutcomeType,
  OperatorKind,
  Quantifier,
  RecoveryStrategy,
  RuleDefinition,
  RulePhase,
} from './types';

const OPERATOR_KINDS: OperatorKind[] = [
  'IsPresent',
  'IsAbsent',
  'Equals',
  'NotEquals',
  'InSet',
  'NotInSet',
  'GreaterThan',
  'LessThan',
  'GreaterOrEqual',
  'LessOrEqual',
  'WithinRange',
  'Matches',
  'IsCompatibleWith',
  'IsEligibleFor',
  'Exists',
];

const QUANTIFIERS: Quantifier[] = ['This', 'Any', 'Every'];
const LOGICAL_OPS: LogicalOperator[] = ['All', 'Any', 'Not'];
const PHASES: RulePhase[] = ['Derive', 'Validate', 'Route'];
const OUTCOME_TYPES: OutcomeType[] = [
  'Continue',
  'Suppressed',
  'CompleteHold',
  'PartialHold',
  'Warning',
  'ComplianceAlert',
  'RouteToReview',
  'RouteToQueue',
  'Escalate',
  'SetValue',
  'ApplyDefault',
  'CalculateValue',
  'CreatePlaceholder',
  'CreateIncident',
  'CreateTask',
  'PreventAction',
  'AllowAction',
];

function parseEnum<T extends string>(
  raw: unknown,
  valid: T[],
  what: string,
): T {
  if (typeof raw !== 'string') {
    throw new Error(`Expected a string for ${what}, got ${typeof raw}.`);
  }
  const match = valid.find((v) => v.toLowerCase() === raw.toLowerCase());
  if (match === undefined) {
    throw new Error(`'${raw}' is not a valid ${what}.`);
  }
  return match;
}

function asObject(node: unknown, what: string): Record<string, unknown> {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    throw new Error(`${what} must be a JSON object.`);
  }
  return node as Record<string, unknown>;
}

function parseCondition(node: unknown): Condition {
  const obj = asObject(node, 'Condition');
  const typeRaw = obj.type;
  if (typeof typeRaw !== 'string') {
    throw new Error("Condition is missing the 'type' discriminator.");
  }
  const type = typeRaw.toLowerCase();

  if (type === 'leaf') {
    if (typeof obj.subject !== 'string') {
      throw new Error("Leaf condition requires 'subject'.");
    }
    const leaf: LeafCondition = {
      type: 'leaf',
      subject: obj.subject,
      operator: parseEnum(obj.operator, OPERATOR_KINDS, 'OperatorKind'),
    };
    if ('value' in obj && obj.value !== undefined) {
      leaf.value = obj.value as LeafCondition['value'];
    }
    if (obj.reference !== undefined && obj.reference !== null) {
      if (typeof obj.reference !== 'string') {
        throw new Error("Leaf condition 'reference' must be a string.");
      }
      leaf.reference = obj.reference;
    }
    if (obj.quantifier !== undefined && obj.quantifier !== null) {
      leaf.quantifier = parseEnum(obj.quantifier, QUANTIFIERS, 'Quantifier');
    }
    return leaf;
  }

  if (type === 'group') {
    const logicalOp = parseEnum(obj.logicalOp, LOGICAL_OPS, 'LogicalOperator');
    const conditions: Condition[] = [];
    if (Array.isArray(obj.conditions)) {
      for (const child of obj.conditions) {
        if (child !== null && child !== undefined) {
          conditions.push(parseCondition(child));
        }
      }
    }
    const group: GroupCondition = { type: 'group', logicalOp, conditions };
    return group;
  }

  throw new Error(`Unknown condition type '${typeRaw}'.`);
}

function parseParameters(node: unknown): OutcomeParameters {
  if (node === undefined || node === null) {
    return {};
  }
  const obj = asObject(node, 'parameters');
  // Values are passed through as parsed JSON (string/number/bool/null/object/array),
  // matching ParameterSerialization.FromNode which preserves primitives.
  return obj as OutcomeParameters;
}

function parseOutcome(node: unknown): Outcome {
  const obj = asObject(node, 'Outcome');
  const outcome: Outcome = {
    type: parseEnum(obj.type, OUTCOME_TYPES, 'OutcomeType'),
    parameters: parseParameters(obj.parameters),
  };
  if (typeof obj.scope === 'string') {
    outcome.scope = obj.scope;
  }
  if (typeof obj.reason === 'string') {
    outcome.reason = obj.reason;
  }
  if (typeof obj.severity === 'string') {
    outcome.severity = obj.severity;
  }
  return outcome;
}

function parseRecovery(node: unknown): RecoveryStrategy {
  const obj = asObject(node, 'RecoveryStrategy');
  if (typeof obj.strategy !== 'string') {
    throw new Error("RecoveryStrategy requires 'strategy'.");
  }
  return {
    strategy: obj.strategy,
    parameters: parseParameters(obj.parameters),
  };
}

/** Deserializes a single rule from its JSON string. Mirrors RuleSerializer.Deserialize. */
export function deserializeRule(json: string): RuleDefinition {
  const parsed: unknown = JSON.parse(json);
  return ruleFromObject(parsed);
}

/** Builds a {@link RuleDefinition} from a parsed JSON object. */
export function ruleFromObject(node: unknown): RuleDefinition {
  const obj = asObject(node, 'RuleDefinition');

  if (typeof obj.key !== 'string') {
    throw new Error('Rule requires a string "key".');
  }
  if (typeof obj.name !== 'string') {
    throw new Error(`Rule '${obj.key}' requires a string "name".`);
  }
  if (obj.onFailure === undefined) {
    throw new Error(`Rule '${obj.key}' requires "onFailure".`);
  }

  const rule: RuleDefinition = {
    key: obj.key,
    name: obj.name,
    // Defaults mirror RuleDefinition.cs property initializers.
    priority: typeof obj.priority === 'number' ? obj.priority : 0,
    phase:
      obj.phase !== undefined
        ? parseEnum(obj.phase, PHASES, 'RulePhase')
        : 'Validate',
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    version: typeof obj.version === 'number' ? obj.version : 1,
    // DateTimeOffset.MinValue → year 0001; we use a sentinel far-past ISO date.
    effectiveDate:
      typeof obj.effectiveDate === 'string'
        ? obj.effectiveDate
        : '0001-01-01T00:00:00+00:00',
    onSuccess:
      obj.onSuccess !== undefined
        ? parseOutcome(obj.onSuccess)
        : { type: 'Continue', parameters: {} },
    onFailure: parseOutcome(obj.onFailure),
  };

  if (typeof obj.description === 'string') {
    rule.description = obj.description;
  }
  if (typeof obj.ruleSet === 'string') {
    rule.ruleSet = obj.ruleSet;
  }
  if (typeof obj.expiryDate === 'string') {
    rule.expiryDate = obj.expiryDate;
  }
  if (obj.appliesWhen !== undefined && obj.appliesWhen !== null) {
    rule.appliesWhen = parseCondition(obj.appliesWhen);
  }
  if (obj.assert !== undefined && obj.assert !== null) {
    rule.assert = parseCondition(obj.assert);
  }
  if (obj.recover !== undefined && obj.recover !== null) {
    rule.recover = parseRecovery(obj.recover);
  }

  return rule;
}
