/**
 * Unit tests for {@link suggestRelevantProperties} — the deterministic, EXISTING-only
 * vocabulary suggester. Pure function, no DB/LLM. Proves it surfaces relevant existing
 * properties from the text, never invents, and returns [] ("unable to suggest") when
 * nothing matches.
 */

import {
  SuggestableProperty,
  suggestRelevantProperties,
} from './vocabulary-suggester';

const PROPS: SuggestableProperty[] = [
  { path: 'test.code', dataType: 'String' },
  {
    path: 'specimen.type',
    dataType: 'String',
    allowedValues: ['FFPE', 'BoneMarrow', 'PeripheralBlood'],
  },
  { path: 'specimen.bodySite', dataType: 'String' },
  { path: 'specimen.fixationTime', dataType: 'Number' },
  { path: 'document.circledHE', dataType: 'String' },
  { path: 'patient.age', dataType: 'Number' },
  { path: 'order.performingLab', dataType: 'String' },
];

const paths = (text: string) =>
  suggestRelevantProperties(text, PROPS).map((s) => s.path);

describe('suggestRelevantProperties', () => {
  it('suggests the relevant existing properties for a FISH/H&E rule', () => {
    const result = paths(
      'Hold the order if Technical FISH on FFPE has no circled H&E.',
    );
    // FFPE is an allowed value of specimen.type; "circled" hits document.circledHE.
    expect(result).toContain('specimen.type');
    expect(result).toContain('document.circledHE');
  });

  it('suggests body-site + specimen type for the derivation rule (existing props only)', () => {
    const result = paths(
      'Derive the body site as Bone Marrow when the specimen type is Bone Marrow and no body site is recorded.',
    );
    expect(result).toContain('specimen.bodySite');
    expect(result).toContain('specimen.type');
    // Everything returned is a REAL property — nothing invented.
    for (const p of result) {
      expect(PROPS.map((x) => x.path)).toContain(p);
    }
  });

  it('matches a fixation-time rule to specimen.fixationTime', () => {
    expect(paths('Flag the specimen when fixation time exceeds 48 hours.')).toContain(
      'specimen.fixationTime',
    );
  });

  it('returns [] ("unable to suggest") when nothing in the vocabulary matches', () => {
    expect(suggestRelevantProperties('xyzzy plugh frobnicate quux', PROPS)).toEqual(
      [],
    );
  });

  it('returns [] for empty / stopword-only text', () => {
    expect(suggestRelevantProperties('the and or if when', PROPS)).toEqual([]);
    expect(suggestRelevantProperties('', PROPS)).toEqual([]);
  });

  it('records the matched tokens (the "why") and is order-stable', () => {
    const once = suggestRelevantProperties(
      'specimen fixation time over 48 hours',
      PROPS,
    );
    const twice = suggestRelevantProperties(
      'specimen fixation time over 48 hours',
      PROPS,
    );
    expect(once).toEqual(twice); // deterministic
    const fixation = once.find((s) => s.path === 'specimen.fixationTime');
    expect(fixation).toBeDefined();
    expect(fixation!.matched).toEqual(expect.arrayContaining(['fixation', 'time']));
  });

  it('sorts by descending match count then path', () => {
    const result = suggestRelevantProperties(
      'specimen fixation time and specimen type',
      PROPS,
    );
    // fixationTime matches {specimen,fixation,time}=3; specimen.type matches {specimen,type}=2.
    expect(result[0].path).toBe('specimen.fixationTime');
    expect(result.map((s) => s.matched.length)).toEqual(
      [...result.map((s) => s.matched.length)].sort((a, b) => b - a),
    );
  });
});
