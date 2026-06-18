import { describe, it, expect } from 'vitest';
import {
  computeVerdict,
  groupLabel,
  groupOutcomesForDetail,
  partitionNoAction,
  isBusinessOutcome,
  ruleAttribution,
  GROUP_LABELS,
} from './resultModel';
import type { Outcome } from '../../lib/types/api';

/** Minimal outcome factory for tests. */
function outcome(group: string, type: string, extra: Partial<Outcome> = {}): Outcome {
  return {
    type,
    group,
    scope: extra.scope ?? null,
    reason: extra.reason ?? null,
    severity: extra.severity ?? null,
    parameters: extra.parameters ?? {},
    ruleKey: extra.ruleKey ?? null,
    ruleName: extra.ruleName ?? null,
  };
}

const CONTINUE = outcome('None', 'Continue');
const SUPPRESSED = outcome('None', 'Suppressed', { reason: 'Default gender applied' });
const HOLD = outcome('Validation', 'CompleteHold', { scope: 'order', reason: 'Held' });
const ROUTE = outcome('Workflow', 'RouteToReview', { scope: 'test', reason: 'Routed' });
const DERIVE = outcome('Derivation', 'SetValue', { reason: 'Pediatric' });

describe('computeVerdict (top-line verdict logic)', () => {
  it('PASSES when there are no business outcomes (only no-action)', () => {
    const v = computeVerdict([CONTINUE, CONTINUE]);
    expect(v.verdict).toBe('passes');
    expect(v.businessCount).toBe(0);
    expect(v.noActionCount).toBe(2);
    expect(v.headlines).toHaveLength(0);
  });

  it('PASSES when there are only derivations (derived values are not holds)', () => {
    const v = computeVerdict([CONTINUE, DERIVE]);
    expect(v.verdict).toBe('passes');
    expect(v.businessCount).toBe(0);
    expect(v.derivationCount).toBe(1);
  });

  it('is HELD with the correct count when a single business outcome is present', () => {
    const v = computeVerdict([CONTINUE, HOLD]);
    expect(v.verdict).toBe('held');
    expect(v.businessCount).toBe(1);
    expect(v.headlines).toEqual([
      {
        type: 'CompleteHold',
        group: 'Validation',
        scope: 'order',
        reason: 'Held',
        ruleKey: null,
        ruleName: null,
      },
    ]);
  });

  it('counts every business group (Validation + Workflow) toward the held count', () => {
    const v = computeVerdict([HOLD, ROUTE, CONTINUE, DERIVE]);
    expect(v.verdict).toBe('held');
    expect(v.businessCount).toBe(2);
    expect(v.noActionCount).toBe(1);
    expect(v.derivationCount).toBe(1);
    expect(v.headlines.map((h) => h.type)).toEqual(['CompleteHold', 'RouteToReview']);
  });

  it('classifies Entity and Control outcomes as business (held)', () => {
    expect(isBusinessOutcome(outcome('Entity', 'CreatePlaceholder'))).toBe(true);
    expect(isBusinessOutcome(outcome('Control', 'PreventAction'))).toBe(true);
    expect(computeVerdict([outcome('Entity', 'CreatePlaceholder')]).verdict).toBe('held');
    expect(computeVerdict([outcome('Control', 'PreventAction')]).verdict).toBe('held');
  });

  it('does NOT classify None or Derivation as business', () => {
    expect(isBusinessOutcome(CONTINUE)).toBe(false);
    expect(isBusinessOutcome(DERIVE)).toBe(false);
  });

  it('carries each business outcome rule attribution onto its headline', () => {
    const pm17 = outcome('Validation', 'CompleteHold', {
      scope: 'order',
      reason: 'Circled H&E not present',
      ruleKey: 'PM17',
      ruleName: 'Circled H&E required for Technical FISH on FFPE',
    });
    const v = computeVerdict([pm17]);
    expect(v.headlines[0]).toMatchObject({
      ruleKey: 'PM17',
      ruleName: 'Circled H&E required for Technical FISH on FFPE',
    });
  });

  it('summarises the DISTINCT rules that produced a business outcome (triggered count + keys)', () => {
    const a = outcome('Validation', 'CompleteHold', { ruleKey: 'PM17', ruleName: 'Hold rule' });
    const b = outcome('Workflow', 'RouteToReview', { ruleKey: 'R09', ruleName: 'Route rule' });
    // A second outcome from the SAME rule must not double-count.
    const a2 = outcome('Control', 'PreventAction', { ruleKey: 'PM17', ruleName: 'Hold rule' });
    const v = computeVerdict([a, b, a2, CONTINUE, DERIVE]);
    expect(v.triggeredRuleKeys).toEqual(['PM17', 'R09']);
  });

  it('omits unattributed (ruleKey-less) outcomes from the triggered keys', () => {
    const v = computeVerdict([HOLD]); // HOLD has no ruleKey
    expect(v.triggeredRuleKeys).toEqual([]);
  });
});

describe('ruleAttribution (consistent rule labelling)', () => {
  it('prefers the readable name when present', () => {
    expect(ruleAttribution({ ruleKey: 'PM17', ruleName: 'Circled H&E required' })).toEqual({
      key: 'PM17',
      name: 'Circled H&E required',
    });
  });

  it('falls back to the key when the name is absent', () => {
    expect(ruleAttribution({ ruleKey: 'PM17', ruleName: null })).toEqual({
      key: 'PM17',
      name: 'PM17',
    });
  });

  it('falls back to a neutral label when neither key nor name is present', () => {
    expect(ruleAttribution({})).toEqual({ key: null, name: 'Unattributed rule' });
  });
});

describe('groupLabel (friendly group-label mapping)', () => {
  it('maps every internal group enum to its friendly heading', () => {
    expect(groupLabel('Validation')).toBe('Holds & alerts');
    expect(groupLabel('Workflow')).toBe('Routing');
    expect(groupLabel('Entity')).toBe('Records created');
    expect(groupLabel('Control')).toBe('Blocked actions');
    expect(groupLabel('Derivation')).toBe('Derived values');
    expect(groupLabel('None')).toBe('No action');
  });

  it('falls back to the raw value for an unknown group', () => {
    expect(groupLabel('Mystery')).toBe('Mystery');
  });

  it('GROUP_LABELS covers every group key used in the mapping', () => {
    expect(Object.keys(GROUP_LABELS).sort()).toEqual(
      ['Control', 'Derivation', 'Entity', 'None', 'Validation', 'Workflow'].sort(),
    );
  });
});

describe('groupOutcomesForDetail (ordered detail groups)', () => {
  it('returns business + derivation groups in deterministic order, omitting empties and no-action', () => {
    const groups = groupOutcomesForDetail([DERIVE, ROUTE, HOLD, CONTINUE]);
    expect(groups.map((g) => g.group)).toEqual(['Validation', 'Workflow', 'Derivation']);
    // No-action (None) is never a detail group.
    expect(groups.some((g) => g.group === 'None')).toBe(false);
  });
});

describe('partitionNoAction (no-action outcomes collapsed separately)', () => {
  it('returns only the None-group outcomes', () => {
    const na = partitionNoAction([HOLD, CONTINUE, SUPPRESSED, DERIVE]);
    expect(na).toEqual([CONTINUE, SUPPRESSED]);
  });

  it('returns an empty list when there are no no-action outcomes', () => {
    expect(partitionNoAction([HOLD, ROUTE])).toEqual([]);
  });
});
