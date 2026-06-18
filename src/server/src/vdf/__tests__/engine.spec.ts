/**
 * Engine behaviour: rule chaining (derived facts feed later phases), apply-default
 * recovery, derivation write-back, determinism, and reconciliation. Mirrors the
 * chaining/recovery scenarios in EngineEndToEndTests + ReconcilerTests.
 */

import { FixedClock } from '../clock';
import { VdfEngine } from '../engine';
import { reconcile, toOpenItems, OpenItem } from '../reconciler';
import { JsonReferenceDataProvider } from '../reference-data';
import { deserializeRule } from '../serializer';
import { JsonObject, RuleDefinition } from '../types';
import {
  FIXED_NOW,
  loadFixture,
  readReferenceDataJson,
  readRuleJson,
} from './corpus';

const references = JsonReferenceDataProvider.fromJson(readReferenceDataJson());
const clock = new FixedClock(FIXED_NOW);

function loadRule(key: string): RuleDefinition {
  return deserializeRule(readRuleJson(key));
}

function run(rules: RuleDefinition[], facts: JsonObject) {
  return new VdfEngine(rules, references, clock).evaluate({
    facts,
    asOf: FIXED_NOW,
  });
}

describe('Rule chaining (Derive → later phase)', () => {
  it('BL3 stamps test.priority=Pediatric and a later rule can read it', () => {
    // A downstream Validate-phase rule that reads the derived fact.
    const chainCheck: RuleDefinition = {
      key: 'CHAIN-PED',
      name: 'Pediatric chain check',
      priority: 10,
      phase: 'Validate',
      enabled: true,
      version: 1,
      effectiveDate: '0001-01-01T00:00:00+00:00',
      appliesWhen: {
        type: 'leaf',
        subject: 'test.priority',
        operator: 'Equals',
        value: 'Pediatric',
      },
      assert: {
        type: 'leaf',
        subject: 'nonexistent.flag',
        operator: 'IsPresent',
      },
      onSuccess: { type: 'Continue', parameters: {} },
      onFailure: {
        type: 'Warning',
        scope: 'test',
        reason: 'Pediatric handling required',
        parameters: {},
      },
    };

    const result = run([loadRule('BL3'), chainCheck], {
      patient: { age: 8 },
      test: {},
    });

    // Derived fact visible in factsAfter.
    expect((result.factsAfter.test as JsonObject).priority).toBe('Pediatric');

    const bl3 = result.trace.find((t) => t.ruleKey === 'BL3');
    expect(bl3?.applied).toBe(true);
    expect(bl3?.produced?.type).toBe('SetValue');

    // The downstream rule observed the stamped value and fired.
    expect(result.outcomes.some((o) => o.type === 'Warning')).toBe(true);
    expect(result.trace.find((t) => t.ruleKey === 'CHAIN-PED')?.applied).toBe(
      true,
    );
  });

  it('BL3 adult does not stamp or chain', () => {
    const result = run([loadRule('BL3')], { patient: { age: 40 }, test: {} });
    expect((result.factsAfter.test as JsonObject).priority).toBeUndefined();
    expect(result.outcomes.some((o) => o.type === 'SetValue')).toBe(false);
  });
});

describe('apply-default recovery (BL27)', () => {
  it('missing gender → recovery sets patient.gender=Other and yields Suppressed', () => {
    const result = run([loadRule('BL27')], loadFixture('BL27_fires.json'));
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].type).toBe('Suppressed');
    expect((result.factsAfter.patient as JsonObject).gender).toBe('Other');

    const trace = result.trace.find((t) => t.ruleKey === 'BL27');
    expect(trace?.recoveryAttempted).toBe(true);
    expect(trace?.recoveryResolved).toBe(true);
  });

  it('present gender → Continue, no recovery', () => {
    const result = run([loadRule('BL27')], { patient: { gender: 'Female' } });
    expect(result.outcomes[0].type).toBe('Continue');
    expect(
      result.trace.find((t) => t.ruleKey === 'BL27')?.recoveryAttempted,
    ).toBe(false);
  });
});

describe('SetValue derivation write-back (BL20)', () => {
  it('Bone Marrow without body site stamps specimen.bodySite=BoneMarrow', () => {
    const result = run([loadRule('BL20')], {
      specimen: { type: 'BoneMarrow' },
    });
    expect(result.outcomes[0].type).toBe('SetValue');
    expect((result.factsAfter.specimen as JsonObject).bodySite).toBe(
      'BoneMarrow',
    );
  });
});

describe('Determinism', () => {
  it('the same request evaluated twice produces identical outcomes', () => {
    const rules = ['PM17', 'PM48', 'BL3', 'BL27', 'BL20', 'BL8'].map(loadRule);
    const facts = loadFixture('PM17_fires.json');
    const a = run(rules, facts);
    const b = run(rules, facts);
    expect(JSON.stringify(a.outcomes)).toBe(JSON.stringify(b.outcomes));
    expect(JSON.stringify(a.trace)).toBe(JSON.stringify(b.trace));
  });

  it('input facts are never mutated', () => {
    const facts: JsonObject = { specimen: { type: 'BoneMarrow' } };
    const snapshot = JSON.stringify(facts);
    run([loadRule('BL20')], facts);
    expect(JSON.stringify(facts)).toBe(snapshot);
  });
});

describe('Reconciler', () => {
  it('prior CompleteHold for PM17, current run with circledHE present → PM17 closed', () => {
    const pm17 = loadRule('PM17');

    // Prior: PM17 fired (missing circled H&E).
    const priorRun = run(
      [pm17],
      loadFixture('PM17_FISH_FFPE_missing_circledHE.json'),
    );
    const prior: OpenItem[] = toOpenItems(priorRun.trace);
    expect(
      prior.some(
        (i) => i.ruleKey === 'PM17' && i.outcome.type === 'CompleteHold',
      ),
    ).toBe(true);

    // Current: circled H&E now present → PM17 continues (no hold).
    const currentRun = run(
      [pm17],
      loadFixture('PM17_FISH_FFPE_circledHE_present.json'),
    );
    const current: OpenItem[] = toOpenItems(currentRun.trace);

    const { opened, kept, closed } = reconcile(prior, current);
    expect(
      closed.some(
        (i) => i.ruleKey === 'PM17' && i.outcome.type === 'CompleteHold',
      ),
    ).toBe(true);
    expect(kept).toHaveLength(0);
    expect(opened).toHaveLength(0);
  });

  it('reconcile is idempotent (same hold kept across identical runs)', () => {
    const pm17 = loadRule('PM17');
    const r = run([pm17], loadFixture('PM17_FISH_FFPE_missing_circledHE.json'));
    const items = toOpenItems(r.trace);
    const { opened, kept, closed } = reconcile(items, items);
    expect(opened).toHaveLength(0);
    expect(closed).toHaveLength(0);
    expect(kept.length).toBe(items.length);
  });
});
