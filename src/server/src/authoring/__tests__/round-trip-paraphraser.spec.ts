/**
 * Round-trip paraphraser tests: each corpus rule yields a non-empty, deterministic
 * sentence containing the key nouns of its semantics.
 */

import { readRuleJson } from '../../vdf/__tests__/corpus';
import { deserializeRule } from '../../vdf/serializer';
import { RoundTripParaphraser } from '../round-trip-paraphraser';

describe('RoundTripParaphraser', () => {
  const paraphraser = new RoundTripParaphraser();

  const paraphraseKey = (key: string): string =>
    paraphraser.paraphrase(deserializeRule(readRuleJson(key)));

  const CASES: ReadonlyArray<[string, RegExp[]]> = [
    ['PM17', [/circled\s*H&E|circledHE/i, /hold/i]],
    ['PM48', [/archiveRetrievalDate/i, /partial hold/i]],
    ['BL3', [/patient\.age/i, /set test\.priority/i]],
    ['BL27', [/patient\.gender/i, /apply default/i]],
    ['BL46', [/prevent/i, /submit-order|submission/i]],
    ['PM49', [/review/i]],
    ['BL36', [/placeholder/i, /PeripheralBlood/i]],
  ];

  it.each(CASES)(
    '%s paraphrases to a sentence with key nouns',
    (key, patterns) => {
      const sentence = paraphraseKey(key);
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.endsWith('.')).toBe(true);
      for (const pattern of patterns) {
        expect(sentence).toMatch(pattern);
      }
    },
  );

  it('is deterministic — same rule yields the same sentence', () => {
    expect(paraphraseKey('PM17')).toBe(paraphraseKey('PM17'));
    expect(paraphraseKey('BL46')).toBe(paraphraseKey('BL46'));
  });

  it('renders PM17 with both its applicability and its hold', () => {
    const sentence = paraphraseKey('PM17');
    // group All → "and"; assert wrapped in "require ... to be present" (faithful to
    // the .NET port, which composes the rendered assert with the wrapper phrase);
    // CompleteHold renders the problem hold + reason.
    expect(sentence).toMatch(/test\.code is in TechnicalFISH and/i);
    expect(sentence).toMatch(/require document\.circledHE.*to be present/i);
    expect(sentence).toMatch(/complete problem hold/i);
  });
});
