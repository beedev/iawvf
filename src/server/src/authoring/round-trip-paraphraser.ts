/**
 * Deterministic structure → English back-translation of a {@link RuleDefinition}.
 *
 * A faithful port of {@link ../../backend/IAW.Vdf.Authoring/Paraphrase/RoundTripParaphraser.cs}:
 * the output is stable (same rule → same sentence) and covers every operator,
 * quantifier, outcome type, and recovery strategy. Derivation rules (no Assert)
 * render as "When …, …"; validation/route rules render as "require … to be present".
 */

import {
  Condition,
  GroupCondition,
  LeafCondition,
  Outcome,
  RecoveryStrategy,
  RecoveryStrategyName,
  RuleDefinition,
} from '../vdf/types';

/** Produces a deterministic English description of a rule's semantics. */
export class RoundTripParaphraser {
  paraphrase(rule: RuleDefinition): string {
    // Derivation rules have no Assert — they produce an outcome on AppliesWhen alone.
    if (rule.assert === undefined) {
      if (rule.appliesWhen !== undefined) {
        const when = renderCondition(rule.appliesWhen);
        const outcome = renderOutcome(rule.onFailure);
        return `When ${when}, ${outcome}.`;
      }
      return `Always: ${renderOutcome(rule.onFailure)}.`;
    }

    const assertPhrase = renderCondition(rule.assert);

    if (rule.appliesWhen !== undefined) {
      const whenPhrase = renderCondition(rule.appliesWhen);
      const recoveryPhrase = rule.recover
        ? `${renderRecovery(rule.recover)}; if unresolved, `
        : '';
      const failurePhrase = renderOutcome(rule.onFailure);
      return `For orders where ${whenPhrase}, require ${assertPhrase} to be present; if absent, ${recoveryPhrase}${failurePhrase}.`;
    }

    const recoveryPhrase = rule.recover
      ? `${renderRecovery(rule.recover)}. If unresolved, `
      : '';
    const failurePhrase = renderOutcome(rule.onFailure);
    return `Require ${assertPhrase} to be present; ${recoveryPhrase}${failurePhrase}.`;
  }
}

// ── Condition rendering ───────────────────────────────────────────────────────

function renderCondition(condition: Condition): string {
  return condition.type === 'leaf'
    ? renderLeaf(condition)
    : renderGroup(condition);
}

function renderLeaf(leaf: LeafCondition): string {
  const subject = leaf.subject;
  const quantifier = leaf.quantifier ?? 'This';
  const prefix =
    quantifier === 'Any'
      ? `any ${subject}`
      : quantifier === 'Every'
        ? `every ${subject}`
        : subject;

  switch (leaf.operator) {
    case 'IsPresent':
      return `${prefix} is present`;
    case 'IsAbsent':
      return `${prefix} is absent`;
    case 'Equals':
      return `${prefix} equals ${renderValue(leaf)}`;
    case 'NotEquals':
      return `${prefix} does not equal ${renderValue(leaf)}`;
    case 'InSet':
      return `${prefix} is in ${renderRef(leaf)}`;
    case 'NotInSet':
      return `${prefix} is not in ${renderRef(leaf)}`;
    case 'GreaterThan':
      return `${prefix} is greater than ${renderRef(leaf)}`;
    case 'LessThan':
      return `${prefix} is less than ${renderRef(leaf)}`;
    case 'GreaterOrEqual':
      return `${prefix} is greater than or equal to ${renderRef(leaf)}`;
    case 'LessOrEqual':
      return `${prefix} is less than or equal to ${renderRef(leaf)}`;
    case 'WithinRange':
      return `${prefix} is within range ${renderRef(leaf)}`;
    case 'Matches':
      return `${prefix} matches ${renderRef(leaf)}`;
    case 'IsCompatibleWith':
      return `${prefix} is compatible with ${renderRef(leaf)}`;
    case 'IsEligibleFor':
      return `${prefix} is eligible for ${renderRef(leaf)}`;
    case 'Exists':
      return `${prefix} exists`;
    default:
      return `${prefix} ${String(leaf.operator)} ${renderValue(leaf)}`;
  }
}

function renderGroup(group: GroupCondition): string {
  const children = group.conditions.map(renderCondition);
  switch (group.logicalOp) {
    case 'All':
      return children.join(' and ');
    case 'Any':
      return children.join(' or ');
    case 'Not':
      return children.length === 1
        ? `not (${children[0]})`
        : `(${children.join(', ')})`;
    default:
      return `(${children.join(', ')})`;
  }
}

function renderValue(leaf: LeafCondition): string {
  if (leaf.value !== undefined && leaf.value !== null) {
    return stripQuotes(leaf.value);
  }
  if (leaf.reference !== undefined) {
    return leaf.reference;
  }
  return 'null';
}

function renderRef(leaf: LeafCondition): string {
  if (leaf.reference !== undefined) {
    return leaf.reference;
  }
  return leaf.value !== undefined && leaf.value !== null
    ? stripQuotes(leaf.value)
    : 'null';
}

function stripQuotes(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

// ── Outcome rendering ─────────────────────────────────────────────────────────

function renderOutcome(outcome: Outcome): string {
  const scope = outcome.scope ?? 'order';
  const reasonSuffix =
    outcome.reason && outcome.reason.trim() !== '' ? `: ${outcome.reason}` : '';

  switch (outcome.type) {
    case 'Continue':
      return 'proceed';
    case 'Suppressed':
      return 'suppress the hold (resolved by recovery)';
    case 'CompleteHold':
      return `place a complete problem hold on the ${scope}${reasonSuffix}`;
    case 'PartialHold':
      return `place a partial hold on the ${scope}${reasonSuffix}`;
    case 'Warning':
      return `raise a warning on the ${scope}${reasonSuffix}`;
    case 'ComplianceAlert':
      return buildComplianceAlert(outcome);
    case 'RouteToReview':
      return buildRouteToReview(outcome);
    case 'RouteToQueue':
      return buildRouteToQueue(outcome);
    case 'Escalate':
      return `escalate the ${scope}${reasonSuffix}`;
    case 'SetValue':
      return buildSetValue(outcome);
    case 'ApplyDefault':
      return `apply the default value to ${paramOr(outcome, 'Target', 'target')}`;
    case 'CalculateValue':
      return `calculate the value for ${paramOr(outcome, 'Target', 'target')}`;
    case 'CreatePlaceholder':
      return `create a placeholder ${paramOr(outcome, 'SpecimenType', 'specimen')} specimen`;
    case 'CreateIncident':
      return `create an incident for the ${scope}${reasonSuffix}`;
    case 'CreateTask':
      return `create a task for the ${scope}${reasonSuffix}`;
    case 'PreventAction':
      return `prevent the '${paramOr(outcome, 'Action', 'action')}' action`;
    case 'AllowAction':
      return `allow the '${paramOr(outcome, 'Action', 'action')}' action`;
    default:
      return String(outcome.type);
  }
}

function buildComplianceAlert(outcome: Outcome): string {
  const scope = outcome.scope ?? 'order';
  const article =
    (outcome.severity ?? '').toLowerCase() === 'informational'
      ? 'an informational'
      : 'a';
  return `raise ${article} compliance alert on the ${scope}`;
}

function buildRouteToReview(outcome: Outcome): string {
  const scope = outcome.scope ?? 'order';
  return `route the ${scope} to ${paramOr(outcome, 'Destination', 'review queue')} for review`;
}

function buildRouteToQueue(outcome: Outcome): string {
  const scope = outcome.scope ?? 'order';
  return `route the ${scope} to ${paramOr(outcome, 'Queue', 'queue')}`;
}

function buildSetValue(outcome: Outcome): string {
  const target = paramOr(outcome, 'Target', 'target');
  const value = paramOr(outcome, 'Value', 'value');
  return `set ${target} to '${value}'`;
}

/** Returns the string-coerced parameter value, or a fallback when absent/blank. */
function paramOr(outcome: Outcome, key: string, fallback: string): string {
  const value = outcome.parameters[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// ── Recovery rendering ────────────────────────────────────────────────────────

function renderRecovery(recover: RecoveryStrategy): string {
  if (
    recover.strategy.toLowerCase() ===
    RecoveryStrategyName.ApplyDefault.toLowerCase()
  ) {
    const target = stringParam(recover.parameters['Target'], 'target');
    const reference = stringParam(recover.parameters['Reference'], 'reference');
    return `first attempt to apply default value to ${target} from ${reference}`;
  }
  if (
    recover.strategy.toLowerCase() ===
    RecoveryStrategyName.FindAlternateSpecimen.toLowerCase()
  ) {
    return 'first search for an alternate compatible specimen';
  }
  return `first attempt recovery via '${recover.strategy}'`;
}

function stringParam(value: unknown, fallback: string): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
