import { describe, it, expect } from 'vitest';
import {
  SCENARIOS,
  scenariosByCategory,
  findScenario,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type Scenario,
} from './scenarios';

/**
 * Scenario-isolation helper: given a scenario's expected verdict CATEGORY, the kind of business
 * outcome it should produce is fully determined. This lets us assert each scenario is internally
 * consistent (its category matches its rule/expected shape) WITHOUT a live API:
 *   passes  → no business outcome expected (expected label starts with "Passes")
 *   fails   → exactly one business outcome expected (a named rule)
 *   derives → no hold; a derived value (expected label starts with "Derives")
 */
function categoryIsConsistent(s: Scenario): boolean {
  switch (s.category) {
    case 'passes':
      return s.expected.startsWith('Passes') && s.rule === '—';
    case 'derives':
      return s.expected.startsWith('Derives') && s.rule !== '—';
    case 'fails':
      // A fail names a rule and labels a single business outcome (Hold / Route / Alert / Prevent /
      // Placeholder), never "Passes" or "Derives".
      return (
        s.rule !== '—' &&
        !s.expected.startsWith('Passes') &&
        !s.expected.startsWith('Derives') &&
        /\((PM|BL)/.test(s.expected)
      );
    default:
      return false;
  }
}

describe('scenario library shape', () => {
  it('has a curated set of 10–13 scenarios', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(10);
    expect(SCENARIOS.length).toBeLessThanOrEqual(13);
  });

  it('every scenario id is unique', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scenario carries the fields the picker + info card render', () => {
    for (const s of SCENARIOS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.expected).toBeTruthy();
      expect(CATEGORY_ORDER).toContain(s.category);
      expect(s.factsJson).toBeTypeOf('object');
    }
  });

  it('includes patient.gender on every scenario so BL27 never fires its Suppressed gender default', () => {
    for (const s of SCENARIOS) {
      const patient = s.factsJson.patient as Record<string, unknown> | undefined;
      expect(patient?.gender, `${s.id} must set patient.gender for isolation`).toBeDefined();
    }
  });

  it("each scenario's expected category matches its expected label / rule shape", () => {
    for (const s of SCENARIOS) {
      expect(categoryIsConsistent(s), `${s.id} (${s.category}) is internally consistent`).toBe(true);
    }
  });

  it('covers all three shelves', () => {
    const cats = new Set(SCENARIOS.map((s) => s.category));
    expect(cats).toEqual(new Set(['passes', 'fails', 'derives']));
  });
});

describe('scenariosByCategory grouping', () => {
  it('groups in CATEGORY_ORDER and only non-empty shelves', () => {
    const groups = scenariosByCategory();
    expect(groups.map((g) => g.category)).toEqual(['passes', 'fails', 'derives']);
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[g.category]).toBeTruthy();
    }
  });

  it('partitions the full library with no scenario lost or duplicated', () => {
    const total = scenariosByCategory().reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(SCENARIOS.length);
  });
});

describe('findScenario', () => {
  it('resolves a known id and returns undefined otherwise', () => {
    expect(findScenario('fail-pm17')?.rule).toBe('PM17');
    expect(findScenario('nope')).toBeUndefined();
  });
});
