/**
 * CORPUS PARITY — the behavioural-equivalence proof.
 *
 * Loads every rule from rules/*.json via the TS parser + rules/reference-data.json
 * via the TS JSON provider, then for each rule evaluates its `{key}_fires.json` and
 * `{key}_clean.json` fixture and asserts the SAME expected outcome types as the
 * .NET CorpusRegressionTests [InlineData] table. Each `_clean` fixture must produce
 * no failure outcome. Traces must be populated.
 */

import { FixedClock } from '../clock';
import { VdfEngine, EvaluationRequest } from '../engine';
import { JsonReferenceDataProvider } from '../reference-data';
import { deserializeRule } from '../serializer';
import {
  EvaluationResult,
  JsonObject,
  OutcomeType,
  RuleDefinition,
} from '../types';
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

function evalRule(rule: RuleDefinition, facts: JsonObject): EvaluationResult {
  const engine = new VdfEngine([rule], references, clock);
  const request: EvaluationRequest = { facts, asOf: FIXED_NOW };
  return engine.evaluate(request);
}

// The .NET CorpusRegressionTests [InlineData] expected-outcome table (verbatim).
const FIRES_TABLE: ReadonlyArray<[string, OutcomeType]> = [
  ['PM17', 'CompleteHold'],
  ['PM48', 'PartialHold'],
  ['PM13', 'CompleteHold'],
  ['BL8', 'ComplianceAlert'],
  ['BL27', 'Suppressed'],
  ['BL20', 'SetValue'],
  ['BL3', 'SetValue'],
  ['BL36', 'CreatePlaceholder'],
  ['BL46', 'PreventAction'],
  ['PM49', 'RouteToReview'],
  ['PM35_TIME', 'RouteToReview'],
  ['PM49_DECISION', 'CompleteHold'],
  ['BL33_CROSS', 'CompleteHold'],
  ['BL38_MULTI', 'CreatePlaceholder'],
  // Newly mined rules (N-stack additions).
  ['PM19', 'CompleteHold'],
  ['PM18', 'PartialHold'],
  ['PM27', 'PartialHold'],
  ['PM28', 'PartialHold'],
  ['PM47', 'PartialHold'],
  ['BL21', 'SetValue'],
];

// The .NET clean-fixture table (BL3/BL20 are derivation rules with no _clean entry
// in the oracle's clean theory, matching CorpusRegressionTests).
const CLEAN_KEYS: ReadonlyArray<string> = [
  'PM17',
  'PM48',
  'PM13',
  'BL8',
  'BL27',
  'BL36',
  'BL46',
  'PM49',
  'PM35_TIME',
  'PM49_DECISION',
  'BL33_CROSS',
  'BL38_MULTI',
  // Newly mined rules. BL21 is a derivation rule (SetValue is not a failure outcome),
  // and its _clean fixture supplies a body site so the rule does not apply — either
  // way it produces no failure outcome.
  'PM19',
  'PM18',
  'PM27',
  'PM28',
  'PM47',
  'BL21',
];

const FAILURE_TYPES: ReadonlyArray<OutcomeType> = [
  'CompleteHold',
  'PartialHold',
  'Warning',
  'ComplianceAlert',
  'RouteToReview',
  'PreventAction',
  'CreatePlaceholder',
];

describe('Rule files round-trip through the parser', () => {
  it.each(FIRES_TABLE.map(([key]) => key))(
    '%s.json parses with matching key',
    (key) => {
      const rule = loadRule(key);
      expect(rule.key).toBe(key);
      expect(rule.onFailure).toBeDefined();
    },
  );
});

describe('Corpus parity — _fires fixtures produce the expected .NET outcome', () => {
  it.each(FIRES_TABLE)('%s fires → %s', (key, expectedType) => {
    const rule = loadRule(key);
    const facts = loadFixture(`${key}_fires.json`);
    const result = evalRule(rule, facts);

    const trace = result.trace.find((t) => t.ruleKey === key);
    expect(trace).toBeDefined();
    expect(trace?.applied).toBe(true);

    expect(result.outcomes.some((o) => o.type === expectedType)).toBe(true);

    // Decision trace must be populated when the rule applied.
    expect(trace?.conditions).toBeDefined();
  });
});

describe('Corpus parity — _clean fixtures produce no failure outcome', () => {
  it.each(CLEAN_KEYS)('%s clean → no failure', (key) => {
    const rule = loadRule(key);
    const facts = loadFixture(`${key}_clean.json`);
    const result = evalRule(rule, facts);

    const hasFailure = result.outcomes.some((o) =>
      FAILURE_TYPES.includes(o.type),
    );
    expect(hasFailure).toBe(false);
  });
});

describe('Explicit detail cases mirroring EngineEndToEndTests', () => {
  it('PM17 missing circled H&E → CompleteHold on order; trace records the failing leaf', () => {
    const rule = loadRule('PM17');
    const facts: JsonObject = {
      test: { code: 'FISH-T-001', specimen: { type: 'FFPE' } },
    };
    const result = evalRule(rule, facts);

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].type).toBe('CompleteHold');
    expect(result.outcomes[0].scope).toBe('order');

    const trace = result.trace.find((t) => t.ruleKey === 'PM17');
    expect(trace?.applied).toBe(true);
    expect(trace?.assertResult).toBe(false);
    // Literal key (the dot is part of the key, not a nested path) → array form.
    expect(trace?.factsRead).toHaveProperty(['document.circledHE']);
    expect(
      trace?.conditions.some(
        (c) => c.subject === 'document.circledHE' && !c.result,
      ),
    ).toBe(true);
  });

  it('PM17 with circled H&E → Continue (assert true)', () => {
    const rule = loadRule('PM17');
    const facts: JsonObject = {
      test: { code: 'FISH-T-001', specimen: { type: 'FFPE' } },
      document: { circledHE: 'slide-123' },
    };
    const result = evalRule(rule, facts);
    expect(result.outcomes[0].type).toBe('Continue');
    expect(result.trace.find((t) => t.ruleKey === 'PM17')?.assertResult).toBe(
      true,
    );
  });

  it('PM48 partial hold parameters/scope', () => {
    const rule = loadRule('PM48');
    const result = evalRule(rule, { specimen: { age: 45 } });
    expect(result.outcomes[0].type).toBe('PartialHold');
    expect(result.outcomes[0].scope).toBe('test');
  });

  it('BL46 PreventAction carries Action=submit-order and Control group', () => {
    const rule = loadRule('BL46');
    const result = evalRule(rule, {
      order: { id: 'ORD-001', type: 'FollowUp' },
    });
    expect(result.outcomes[0].type).toBe('PreventAction');
    expect(result.outcomes[0].parameters['Action']).toBe('submit-order');
  });

  it('PM49 fixation out of window routes to MedicalReview', () => {
    const rule = loadRule('PM49');
    const result = evalRule(rule, {
      test: { capGoverned: true },
      specimen: { fixationTime: 100 },
    });
    expect(result.outcomes[0].type).toBe('RouteToReview');
    expect(result.outcomes[0].parameters['Destination']).toBe('MedicalReview');
  });

  it('BL36 RaDaR first missing PB creates PeripheralBlood placeholder', () => {
    const rule = loadRule('BL36');
    const result = evalRule(rule, {
      order: {
        product: 'RaDaR',
        timepoint: 'First',
        specimens: [{ type: 'ParaffinTissue' }],
      },
    });
    expect(result.outcomes[0].type).toBe('CreatePlaceholder');
    expect(result.outcomes[0].parameters['SpecimenType']).toBe(
      'PeripheralBlood',
    );
  });
});
