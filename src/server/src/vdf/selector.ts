/**
 * Rule selection and ordering. Ports RuleSelector.cs: keeps enabled rules within
 * their effective/expiry window, then orders by phase (Derive → Validate → Route),
 * then ascending priority, then key (ordinal) for a stable, deterministic sequence.
 * AppliesWhen is evaluated by the engine per-fact, not here.
 */

import { RuleDefinition, RulePhase } from './types';

const PHASE_ORDER: Record<RulePhase, number> = {
  Derive: 0,
  Validate: 1,
  Route: 2,
};

/** Parses an ISO-8601 date to epoch ms, treating the year-0001 sentinel as -Infinity. */
function toEpoch(iso: string | undefined): number {
  if (iso === undefined) {
    return Number.NEGATIVE_INFINITY;
  }
  // The .NET MinValue sentinel (year 0001) means "always effective".
  if (iso.startsWith('0001-01-01')) {
    return Number.NEGATIVE_INFINITY;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** Whether a rule's effective/expiry window contains the instant. Mirrors IsWithinWindow. */
export function isWithinWindow(rule: RuleDefinition, asOf: string): boolean {
  const asOfMs = Date.parse(asOf);
  const effectiveMs = toEpoch(rule.effectiveDate);
  if (asOfMs < effectiveMs) {
    return false;
  }
  if (rule.expiryDate !== undefined) {
    const expiryMs = Date.parse(rule.expiryDate);
    if (!Number.isNaN(expiryMs) && asOfMs >= expiryMs) {
      return false;
    }
  }
  return true;
}

function compareOrdinal(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Selects the eligible rules at {@link asOf}, in deterministic phase/priority/key order. */
export function selectRules(
  rules: RuleDefinition[],
  asOf: string,
): RuleDefinition[] {
  return rules
    .filter((r) => r.enabled)
    .filter((r) => isWithinWindow(r, asOf))
    .slice()
    .sort((a, b) => {
      const phaseDiff = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
      if (phaseDiff !== 0) {
        return phaseDiff;
      }
      const priorityDiff = a.priority - b.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return compareOrdinal(a.key, b.key);
    });
}
