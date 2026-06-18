/**
 * Schema-validation tests: a corpus rule validates clean; structurally malformed
 * rules fail with a useful, path-bearing error.
 */

import { readRuleJson } from '../../vdf/__tests__/corpus';
import { SchemaValidator } from '../schema-validator';

describe('SchemaValidator', () => {
  const validator = new SchemaValidator();

  it('validates a well-formed corpus rule (PM17)', () => {
    const result = validator.validateRule(readRuleJson('PM17'));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a rule missing the required onFailure outcome', () => {
    const bad = JSON.stringify({
      key: 'X',
      name: 'No failure outcome',
      onSuccess: { type: 'Continue' },
    });
    const result = validator.validateRule(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /onFailure/.test(e.message))).toBe(true);
  });

  it('rejects a bad condition discriminator (oneOf failure)', () => {
    const bad = JSON.stringify({
      key: 'X',
      name: 'Bad discriminator',
      assert: { type: 'leafy', subject: 'order.type', operator: 'IsPresent' },
      onFailure: { type: 'CompleteHold' },
    });
    const result = validator.validateRule(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // The offending node is the assert condition.
    expect(result.errors.some((e) => e.path.includes('/assert'))).toBe(true);
  });

  it('rejects an unknown outcome type (enum violation) with a useful path', () => {
    const bad = JSON.stringify({
      key: 'X',
      name: 'Bad outcome',
      onFailure: { type: 'NukeFromOrbit' },
    });
    const result = validator.validateRule(bad);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.path.includes('/onFailure/type') && /enum/.test(e.message),
      ),
    ).toBe(true);
  });

  it('surfaces malformed JSON as a single root error rather than throwing', () => {
    const result = validator.validateRule('{ this is not json ');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('');
    expect(result.errors[0].message).toMatch(/Invalid JSON/);
  });
});
