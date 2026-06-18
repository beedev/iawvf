import { describe, it, expect } from 'vitest';
import {
  buildSaveRuleJson,
  buildInterpretScope,
  isUnscoped,
  EMPTY_SCOPE,
  type ScopeSelection,
} from './scope';
import type { RuleJson } from '../../lib/types/api';

const BASE_RULE: RuleJson = {
  key: 'PM48',
  name: 'Archive retrieval required',
  appliesWhen: { type: 'leaf', subject: 'specimen.age', operator: 'GreaterThan' },
  assert: { type: 'leaf', subject: 'specimen.archiveRetrievalDate', operator: 'IsPresent' },
};

describe('isUnscoped / buildInterpretScope (sanity)', () => {
  it('treats the empty selection as unscoped', () => {
    expect(isUnscoped(EMPTY_SCOPE)).toBe(true);
    expect(buildInterpretScope(EMPTY_SCOPE)).toEqual({});
  });
});

describe('buildSaveRuleJson', () => {
  it('injects the selected scope (objects + properties) when the selection is non-empty', () => {
    const selection: ScopeSelection = {
      objects: ['specimen'],
      properties: ['specimen.age', 'specimen.archiveRetrievalDate'],
    };

    const result = buildSaveRuleJson(BASE_RULE, selection);

    expect(result.scope).toEqual({
      objects: ['specimen'],
      properties: ['specimen.age', 'specimen.archiveRetrievalDate'],
    });
  });

  it('preserves every other field of the rule untouched', () => {
    const selection: ScopeSelection = { objects: ['specimen'], properties: [] };

    const result = buildSaveRuleJson(BASE_RULE, selection);

    expect(result.key).toBe('PM48');
    expect(result.name).toBe('Archive retrieval required');
    expect(result.appliesWhen).toEqual(BASE_RULE.appliesWhen);
    expect(result.assert).toEqual(BASE_RULE.assert);
  });

  it('omits the scope key entirely for an unscoped selection (never an empty object)', () => {
    const result = buildSaveRuleJson(BASE_RULE, EMPTY_SCOPE);

    expect('scope' in result).toBe(false);
    expect(result).toEqual(BASE_RULE);
  });

  it('copies the scope arrays so later selection mutations do not leak into the saved rule', () => {
    const selection: ScopeSelection = { objects: ['specimen'], properties: ['specimen.age'] };

    const result = buildSaveRuleJson(BASE_RULE, selection);
    selection.objects.push('order');
    selection.properties.push('order.product');

    expect(result.scope).toEqual({ objects: ['specimen'], properties: ['specimen.age'] });
  });

  it('does not mutate the input rule', () => {
    const selection: ScopeSelection = { objects: ['specimen'], properties: [] };
    const before = JSON.stringify(BASE_RULE);

    buildSaveRuleJson(BASE_RULE, selection);

    expect(JSON.stringify(BASE_RULE)).toBe(before);
  });

  it('respects a scope the author typed into the Edit tab over the current selection', () => {
    const handEdited: RuleJson = {
      ...BASE_RULE,
      scope: { objects: ['order'], properties: ['order.product'] },
    };
    // Selector says "specimen", but the hand-typed scope is authoritative and must win.
    const selection: ScopeSelection = { objects: ['specimen'], properties: ['specimen.age'] };

    const result = buildSaveRuleJson(handEdited, selection);

    expect(result.scope).toEqual({ objects: ['order'], properties: ['order.product'] });
  });

  it('respects a hand-typed scope even when the selector is unscoped', () => {
    const handEdited: RuleJson = {
      ...BASE_RULE,
      scope: { objects: ['order'], properties: [] },
    };

    const result = buildSaveRuleJson(handEdited, EMPTY_SCOPE);

    expect(result.scope).toEqual({ objects: ['order'], properties: [] });
  });
});
