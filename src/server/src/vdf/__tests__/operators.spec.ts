/**
 * Operator unit tests — at least two per family, plus the parity-critical cases:
 * WithinRange, date comparison, InSet-via-reference-array, IsCompatibleWith /
 * IsEligibleFor / Exists, and a catastrophic Matches pattern that must time out to
 * false. Validates OperatorSemantics.cs equivalence.
 */

import { evaluateOperator } from '../operators';
import { JsonReferenceDataProvider } from '../reference-data';
import { JsonValue, OperatorKind } from '../types';

const refs = JsonReferenceDataProvider.fromObject({
  TechnicalFISH: ['FISH-T-001', 'FISH-T-002'],
  'TestCompendium.compatibleSpecimens': [
    'FFPE',
    'FreshTissue',
    'BoneMarrow',
    'PeripheralBlood',
  ],
  'TestCompendium.nyValidation': ['Lab-NY-1', 'Lab-NY-2'],
  'PolicyThresholds.fixationWindow': { min: 6, max: 72 },
  'PolicyThresholds.archiveAgeDays': 30,
  PatientHistory: true,
});

// Mirrors LeafCondition.Evaluate: when a reference key is supplied, the comparand
// `right` is the resolved reference value, and the key is passed through as
// referenceKey (only the matching/eligibility/exists family consults the key).
function evalOp(
  op: OperatorKind,
  left: JsonValue | null,
  right: JsonValue | null,
  ref?: string,
): boolean {
  const resolvedRight = ref !== undefined ? refs.resolve(ref) : right;
  return evaluateOperator(op, left, resolvedRight, refs, ref);
}

describe('Presence family', () => {
  it('IsPresent true for a value, false for null', () => {
    expect(evalOp('IsPresent', 'x', null)).toBe(true);
    expect(evalOp('IsPresent', null, null)).toBe(false);
  });
  it('IsAbsent true for null, false for a value', () => {
    expect(evalOp('IsAbsent', null, null)).toBe(true);
    expect(evalOp('IsAbsent', 0, null)).toBe(false);
  });
});

describe('Equality family', () => {
  it('Equals coerces numbers (30 == 30.0) and matches strings', () => {
    expect(evalOp('Equals', 30, 30.0)).toBe(true);
    expect(evalOp('Equals', 'FFPE', 'FFPE')).toBe(true);
    expect(evalOp('Equals', true, 'true')).toBe(true);
    expect(evalOp('Equals', 'FFPE', 'Saliva')).toBe(false);
  });
  it('NotEquals is false when left is null (parity with .NET guard)', () => {
    expect(evalOp('NotEquals', null, 'x')).toBe(false);
    expect(evalOp('NotEquals', 'a', 'b')).toBe(true);
  });
});

describe('Membership family', () => {
  it('InSet via reference array (TechnicalFISH)', () => {
    expect(evalOp('InSet', 'FISH-T-001', null, 'TechnicalFISH')).toBe(true);
    expect(evalOp('InSet', 'IHC-P-001', null, 'TechnicalFISH')).toBe(false);
  });
  it('InSet via inline array and NotInSet semantics', () => {
    expect(evalOp('InSet', 'b', ['a', 'b', 'c'])).toBe(true);
    expect(evalOp('NotInSet', 'z', ['a', 'b', 'c'])).toBe(true);
    expect(evalOp('NotInSet', null, ['a'])).toBe(false);
  });
});

describe('Comparison family', () => {
  it('GreaterThan / LessThan numeric', () => {
    expect(evalOp('GreaterThan', 45, 30)).toBe(true);
    expect(evalOp('GreaterThan', 10, 30)).toBe(false);
    expect(evalOp('LessThan', 8, 19)).toBe(true);
  });
  it('GreaterOrEqual / LessOrEqual boundaries', () => {
    expect(evalOp('GreaterOrEqual', 24, 24)).toBe(true);
    expect(evalOp('LessOrEqual', 24, 24)).toBe(true);
    expect(evalOp('GreaterOrEqual', 23, 24)).toBe(false);
  });
  it('date comparison via ISO strings', () => {
    expect(
      evalOp('GreaterThan', '2026-06-02T00:00:00Z', '2026-06-01T00:00:00Z'),
    ).toBe(true);
    expect(evalOp('LessThan', '2026-06-01', '2026-06-02')).toBe(true);
    expect(
      evalOp('GreaterOrEqual', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'),
    ).toBe(true);
  });
  it('a null operand yields false (Compare returns null per .NET guard)', () => {
    expect(evalOp('GreaterThan', null, 5)).toBe(false);
    expect(evalOp('GreaterThan', 5, null)).toBe(false);
    // A word-string vs a number DOES compare ordinally in .NET (both coerce to
    // string via CoerceString), so 'abc' > '5' is true — matching string.CompareOrdinal.
    expect(evalOp('GreaterThan', 'abc', 5)).toBe(true);
  });
});

describe('WithinRange', () => {
  it('inclusive bounds via reference {min,max}', () => {
    expect(
      evalOp('WithinRange', 24, null, 'PolicyThresholds.fixationWindow'),
    ).toBe(true);
    expect(
      evalOp('WithinRange', 6, null, 'PolicyThresholds.fixationWindow'),
    ).toBe(true);
    expect(
      evalOp('WithinRange', 72, null, 'PolicyThresholds.fixationWindow'),
    ).toBe(true);
    expect(
      evalOp('WithinRange', 100, null, 'PolicyThresholds.fixationWindow'),
    ).toBe(false);
    expect(
      evalOp('WithinRange', 5, null, 'PolicyThresholds.fixationWindow'),
    ).toBe(false);
  });
  it('inline range and open bounds', () => {
    expect(evalOp('WithinRange', 50, { min: 10 })).toBe(true);
    expect(evalOp('WithinRange', 5, { min: 10 })).toBe(false);
    expect(evalOp('WithinRange', 5, { max: 10 })).toBe(true);
  });
  it('non-object comparand is false', () => {
    expect(evalOp('WithinRange', 5, 10)).toBe(false);
  });
});

describe('Matching family', () => {
  it('Matches via plain regex pattern', () => {
    expect(evalOp('Matches', 'FISH-T-001', '^FISH')).toBe(true);
    expect(evalOp('Matches', 'IHC-P-001', '^FISH')).toBe(false);
  });
  it('IsCompatibleWith via reference set', () => {
    expect(
      evalOp(
        'IsCompatibleWith',
        'FFPE',
        null,
        'TestCompendium.compatibleSpecimens',
      ),
    ).toBe(true);
    expect(
      evalOp(
        'IsCompatibleWith',
        'Saliva',
        null,
        'TestCompendium.compatibleSpecimens',
      ),
    ).toBe(false);
  });
  it('a catastrophic regex pattern times out to false (ReDoS guard, H3 parity)', () => {
    const evil = '(a+)+$';
    const adversarial = 'a'.repeat(40) + '!';
    const start = Date.now();
    const result = evalOp('Matches', adversarial, evil);
    const elapsed = Date.now() - start;
    expect(result).toBe(false);
    // The guard must return promptly, well under any pathological backtracking time.
    expect(elapsed).toBeLessThan(100);
  });
  it('an invalid regex falls back to exact match', () => {
    expect(evalOp('Matches', '(', '(')).toBe(true);
    expect(evalOp('Matches', 'x', '(')).toBe(false);
  });
});

describe('Reference-eligibility family', () => {
  it('IsEligibleFor via reference set (NY validation labs)', () => {
    expect(
      evalOp('IsEligibleFor', 'Lab-NY-1', null, 'TestCompendium.nyValidation'),
    ).toBe(true);
    expect(
      evalOp('IsEligibleFor', 'Lab-CA-1', null, 'TestCompendium.nyValidation'),
    ).toBe(false);
  });
  it('Exists confirms a truthy reference lookup', () => {
    expect(evalOp('Exists', null, null, 'PatientHistory')).toBe(true);
    expect(evalOp('Exists', null, null, 'NoSuchKey')).toBe(false);
  });
  it('Exists without a reference uses the left/right presence', () => {
    expect(evalOp('Exists', 'present', null)).toBe(true);
    expect(evalOp('Exists', null, ['x'])).toBe(true);
    expect(evalOp('Exists', null, [])).toBe(false);
  });
});
