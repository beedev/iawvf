/**
 * Dry-run preview tests: previewing PM17 over the repo fixtures reports
 * applied + CompleteHold on PM17_fires and no failure on PM17_clean, with no
 * side effects (the input fixtures are never mutated).
 */

import { JsonReferenceDataProvider } from '../../vdf/reference-data';
import { deserializeRule } from '../../vdf/serializer';
import {
  loadFixture,
  readReferenceDataJson,
  readRuleJson,
} from '../../vdf/__tests__/corpus';
import { DryRunPreviewer } from '../dry-run-previewer';

describe('DryRunPreviewer', () => {
  const references = JsonReferenceDataProvider.fromJson(
    readReferenceDataJson(),
  );
  const previewer = new DryRunPreviewer(references);
  const pm17 = deserializeRule(readRuleJson('PM17'));

  it('reports applied + CompleteHold on PM17_fires', () => {
    const result = previewer.previewFromRepoFixtures(pm17);
    const fires = result.hits.find((h) => h.fixtureName === 'PM17_fires');
    expect(fires).toBeDefined();
    expect(fires!.applied).toBe(true);
    expect(fires!.produced).toBe('CompleteHold');
    expect(fires!.reason).toMatch(/Circled H&E not present/);
  });

  it('reports no failure on PM17_clean (assertion satisfied)', () => {
    const result = previewer.previewFromRepoFixtures(pm17);
    const clean = result.hits.find((h) => h.fixtureName === 'PM17_clean');
    expect(clean).toBeDefined();
    expect(clean!.applied).toBe(true);
    // Assertion passed → onSuccess (Continue), never CompleteHold.
    expect(clean!.produced).toBe('Continue');
  });

  it('evaluates every fixture and never mutates the input facts', () => {
    const facts = loadFixture('PM17_fires.json');
    const snapshot = JSON.stringify(facts);
    const result = previewer.preview(pm17, [{ name: 'PM17_fires', facts }]);
    expect(result.evaluated).toBe(1);
    // Side-effect free: the caller's fact object is untouched.
    expect(JSON.stringify(facts)).toBe(snapshot);
  });

  it('marks fixtures where the rule does not apply as not-applied', () => {
    // A fixture with no FISH/FFPE test → PM17's AppliesWhen guard does not hold.
    const result = previewer.preview(pm17, [
      { name: 'unrelated', facts: { order: { type: 'New' } } },
    ]);
    expect(result.hits[0].applied).toBe(false);
    expect(result.hits[0].produced).toBeNull();
  });
});
