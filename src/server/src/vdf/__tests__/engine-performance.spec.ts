/**
 * ENGINE PERFORMANCE SANITY (N7).
 *
 * Synthesizes a large rule set (100+ rules) by loading the full on-disk corpus and
 * cloning every rule under distinct synthetic keys, then evaluates a single fact
 * document against the whole set and asserts the WARM evaluation completes well
 * within a generous, deterministic SLA.
 *
 * Notes on methodology:
 *  - The engine is pure/in-memory: this measures the select → evaluate → trace
 *    hot path with no I/O (the DB seams are exercised elsewhere).
 *  - We run a warm-up pass first (JIT, allocation) and measure the median of
 *    several warm runs so the number is stable across machines.
 *  - The SLA (50 ms) is intentionally generous; the typical warm time on this
 *    machine is reported via console for the record.
 */

import { FixedClock } from '../clock';
import { VdfEngine, EvaluationRequest } from '../engine';
import { JsonReferenceDataProvider } from '../reference-data';
import { deserializeRule } from '../serializer';
import { JsonObject, RuleDefinition } from '../types';
import { FIXED_NOW, readReferenceDataJson, readRuleJson } from './corpus';

/** Every rule key in the shared corpus. */
const CORPUS_KEYS: ReadonlyArray<string> = [
  'PM17',
  'PM48',
  'PM13',
  'BL8',
  'BL27',
  'BL20',
  'BL3',
  'BL36',
  'BL46',
  'PM49',
  'PM35_TIME',
  'PM49_DECISION',
  'BL33_CROSS',
  'BL38_MULTI',
];

/** The number of synthetic variants to generate per corpus rule. */
const VARIANTS_PER_RULE = 10;

/** Generous, machine-independent warm-run SLA. */
const SLA_MS = 50;

const references = JsonReferenceDataProvider.fromJson(readReferenceDataJson());
const clock = new FixedClock(FIXED_NOW);

/**
 * Builds 100+ rules by cloning each corpus rule under VARIANTS_PER_RULE distinct
 * keys. Each variant is a structural copy with a unique key/name so the selector
 * treats it as a separate rule; behaviour is preserved (we only rename the key).
 */
function synthesizeRuleSet(): RuleDefinition[] {
  const base = CORPUS_KEYS.map((key) => deserializeRule(readRuleJson(key)));
  const rules: RuleDefinition[] = [];
  for (let variant = 0; variant < VARIANTS_PER_RULE; variant++) {
    for (const rule of base) {
      rules.push({
        ...rule,
        key: `${rule.key}__perf${variant}`,
        name: `${rule.name} (perf variant ${variant})`,
      });
    }
  }
  return rules;
}

/**
 * A representative fact document touching multiple corpus rules' subjects so the
 * evaluation does real work (not a trivial no-op pass).
 */
const FACTS: JsonObject = {
  test: { code: 'FISH-T-001', capGoverned: true, specimen: { type: 'FFPE' } },
  specimen: { type: 'FFPE', fixationTime: 100, age: 45 },
  order: {
    id: 'ORD-001',
    type: 'FollowUp',
    product: 'RaDaR',
    timepoint: 'First',
    client: { nyStatus: 'Standard' },
    specimens: [{ type: 'ParaffinTissue' }],
  },
  document: { circledHE: 'slide-123' },
};

describe('Engine performance — 100+ rules under SLA', () => {
  it(`evaluates ${VARIANTS_PER_RULE * CORPUS_KEYS.length} rules within ${SLA_MS}ms (warm)`, () => {
    const rules = synthesizeRuleSet();
    expect(rules.length).toBeGreaterThanOrEqual(100);

    const engine = new VdfEngine(rules, references, clock);
    const request: EvaluationRequest = { facts: FACTS, asOf: FIXED_NOW };

    // Warm-up: drive JIT + allocator so the measured runs are steady-state.
    for (let i = 0; i < 20; i++) {
      engine.evaluate(request);
    }

    // Measure several warm runs and take the median (robust to GC jitter).
    const samples: number[] = [];
    for (let i = 0; i < 21; i++) {
      const start = process.hrtime.bigint();
      const result = engine.evaluate(request);
      const end = process.hrtime.bigint();
      samples.push(Number(end - start) / 1_000_000);
      // Sanity: the engine produced a trace entry per rule (it did real work).
      expect(result.trace.length).toBe(rules.length);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];

    console.log(
      `[perf] ${rules.length} rules — warm median ${median.toFixed(3)}ms ` +
        `(min ${samples[0].toFixed(3)}ms, max ${samples[samples.length - 1].toFixed(3)}ms), SLA ${SLA_MS}ms`,
    );

    expect(median).toBeLessThan(SLA_MS);
  });
});
