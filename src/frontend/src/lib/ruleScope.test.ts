import { describe, it, expect } from 'vitest';
import { extractRuleScope, readAuthoredScope } from './ruleScope';
import type { RuleJson } from './types/api';

// PM48 — leaf-only `appliesWhen` + leaf `assert`, both on `specimen`.
const PM48: RuleJson = {
  key: 'PM48',
  appliesWhen: {
    type: 'leaf',
    subject: 'specimen.age',
    operator: 'GreaterThan',
    reference: 'PolicyThresholds.archiveAgeDays',
  },
  assert: { type: 'leaf', subject: 'specimen.archiveRetrievalDate', operator: 'IsPresent' },
  onFailure: { type: 'PartialHold', scope: 'test', reason: 'missing' },
};

// PM17 — grouped `appliesWhen` spanning `test` + a nested `test.specimen.type`, assert on `document`.
const PM17: RuleJson = {
  key: 'PM17',
  appliesWhen: {
    type: 'group',
    logicalOp: 'All',
    conditions: [
      { type: 'leaf', subject: 'test.code', operator: 'InSet', reference: 'TechnicalFISH' },
      { type: 'leaf', subject: 'test.specimen.type', operator: 'Equals', value: 'FFPE' },
    ],
  },
  assert: { type: 'leaf', subject: 'document.circledHE', operator: 'IsPresent' },
  onFailure: { type: 'CompleteHold', scope: 'order', reason: 'missing' },
};

// BL36 — grouped `appliesWhen` over `order` with a `[]` collection subject, assert reuses it.
const BL36: RuleJson = {
  key: 'BL36',
  appliesWhen: {
    type: 'group',
    logicalOp: 'All',
    conditions: [
      { type: 'leaf', subject: 'order.product', operator: 'Equals', value: 'RaDaR' },
      { type: 'leaf', subject: 'order.timepoint', operator: 'Equals', value: 'First' },
      {
        type: 'leaf',
        subject: 'order.specimens[].type',
        operator: 'Equals',
        value: 'ParaffinTissue',
        quantifier: 'Any',
      },
    ],
  },
  assert: {
    type: 'leaf',
    subject: 'order.specimens[].type',
    operator: 'Equals',
    value: 'PeripheralBlood',
    quantifier: 'Any',
  },
  onFailure: { type: 'CreatePlaceholder', scope: 'specimen', reason: 'missing' },
};

describe('extractRuleScope', () => {
  it('derives a single object with its properties for a leaf-only rule (PM48)', () => {
    const scope = extractRuleScope(PM48);

    expect(scope.objects).toHaveLength(1);
    const specimen = scope.objects[0];
    expect(specimen.name).toBe('specimen');
    expect(specimen.label).toBe('Specimen');
    expect(specimen.properties).toEqual(['age', 'archiveRetrievalDate']);
    expect(scope.outcomeScope).toBe('test');
  });

  it('derives multiple objects from a grouped rule (PM17)', () => {
    const scope = extractRuleScope(PM17);

    const names = scope.objects.map((o) => o.name);
    expect(names).toEqual(['test', 'document']);

    const test = scope.objects.find((o) => o.name === 'test')!;
    // The nested `test.specimen.type` keeps its full property path under the first segment.
    expect(test.properties).toEqual(['code', 'specimen.type']);

    const document = scope.objects.find((o) => o.name === 'document')!;
    expect(document.properties).toEqual(['circledHE']);

    expect(scope.outcomeScope).toBe('order');
  });

  it('strips trailing [] collection markers and de-duplicates properties (BL36)', () => {
    const scope = extractRuleScope(BL36);

    expect(scope.objects).toHaveLength(1);
    const order = scope.objects[0];
    expect(order.name).toBe('order');
    expect(order.label).toBe('Order');
    // `order.specimens[].type` appears in both appliesWhen and assert → collapsed once, `[]` stripped.
    expect(order.properties).toEqual(['product', 'timepoint', 'specimens.type']);
    expect(scope.outcomeScope).toBe('specimen');
  });

  it('returns an empty scope for a null / malformed rule', () => {
    expect(extractRuleScope(null)).toEqual({ objects: [] });
    expect(extractRuleScope({})).toEqual({ objects: [] });
  });
});


describe('readAuthoredScope', () => {
  it('returns null when the rule carries no authored scope', () => {
    expect(readAuthoredScope(PM48)).toBeNull();
    expect(readAuthoredScope(null)).toBeNull();
    expect(readAuthoredScope({})).toBeNull();
  });

  it('returns null for an empty authored scope (no objects, no properties)', () => {
    expect(readAuthoredScope({ ...PM48, scope: { objects: [], properties: [] } })).toBeNull();
  });

  it('maps authored objects + property paths into labelled, object-relative scope', () => {
    const rule: RuleJson = {
      ...PM48,
      scope: { objects: ['specimen'], properties: ['specimen.age', 'specimen.fixationTime'] },
    };

    const scope = readAuthoredScope(rule);

    expect(scope).not.toBeNull();
    expect(scope!.objects).toHaveLength(1);
    const specimen = scope!.objects[0];
    expect(specimen.name).toBe('specimen');
    expect(specimen.label).toBe('Specimen');
    expect(specimen.properties).toEqual(['age', 'fixationTime']);
  });

  it('includes an authored object even when no properties were narrowed', () => {
    const rule: RuleJson = { ...PM48, scope: { objects: ['order'], properties: [] } };

    const scope = readAuthoredScope(rule);

    expect(scope!.objects).toEqual([{ name: 'order', label: 'Order', properties: [] }]);
  });

  it('infers objects from property paths when objects are omitted', () => {
    const rule: RuleJson = {
      ...PM48,
      scope: { objects: [], properties: ['test.code', 'test.specimen.type'] },
    };

    const scope = readAuthoredScope(rule);

    expect(scope!.objects).toHaveLength(1);
    expect(scope!.objects[0].name).toBe('test');
    expect(scope!.objects[0].properties).toEqual(['code', 'specimen.type']);
  });
});

describe('authored scope is preferred over derived scope', () => {
  it('prefers the authored scope when present, else falls back to derived', () => {
    // Authored on `order`, but conditions reference `specimen` — authored must win.
    const rule: RuleJson = { ...PM48, scope: { objects: ['order'], properties: [] } };

    const authored = readAuthoredScope(rule);
    const derived = extractRuleScope(rule);
    const primary = authored ?? derived;

    expect(authored).not.toBeNull();
    expect(primary.objects.map((o) => o.name)).toEqual(['order']);
    // Derived still reflects the conditions, available as secondary context.
    expect(derived.objects.map((o) => o.name)).toEqual(['specimen']);
  });

  it('falls back to derived scope when nothing was authored', () => {
    const authored = readAuthoredScope(PM48);
    const derived = extractRuleScope(PM48);
    const primary = authored ?? derived;

    expect(authored).toBeNull();
    expect(primary).toBe(derived);
    expect(primary.objects.map((o) => o.name)).toEqual(['specimen']);
  });
});
