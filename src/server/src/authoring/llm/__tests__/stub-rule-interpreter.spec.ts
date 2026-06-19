/**
 * Offline, deterministic tests for {@link StubRuleInterpreter}. No network, no DB.
 *
 * The stub maps a small set of known phrasings to corpus rules and emits a clear gap
 * for anything unrecognised. These tests pin its determinism (the same input always
 * yields the same candidate) and the PM17-shape contract the prompt requires.
 */

import { GroundingVocabulary } from '../interpreter';
import {
  STUB_INTERPRETER_VERSION,
  StubRuleInterpreter,
} from '../stub-rule-interpreter';

// Grounding is ignored by the stub, so an empty vocabulary is sufficient.
const EMPTY_GROUNDING: GroundingVocabulary = {
  subjects: [],
  operators: [],
  outcomes: [],
  references: [],
};

describe('StubRuleInterpreter (offline)', () => {
  const stub = new StubRuleInterpreter();

  it('maps the circled-H&E + FISH + FFPE sentence to a PM17-shaped candidate', async () => {
    const result = await stub.interpret(
      'Hold the order if Technical FISH on FFPE has no circled H&E',
      EMPTY_GROUNDING,
    );

    expect(result.candidate).not.toBeNull();
    expect(result.gaps).toHaveLength(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.interpreterVersion).toBe(STUB_INTERPRETER_VERSION);
    expect(result.naturalLanguage).toMatch(/circled H&E/);

    const rule = result.candidate!;
    expect(rule.key).toBe('PM17');
    // PM17 shape: appliesWhen All(test.code InSet TechnicalFISH, test.specimen.type Equals FFPE),
    // assert document.circledHE IsPresent, onFailure CompleteHold.
    expect(rule.assert).toEqual({
      type: 'leaf',
      subject: 'document.circledHE',
      operator: 'IsPresent',
    });
    expect(rule.onFailure.type).toBe('CompleteHold');
    expect(rule.appliesWhen?.type).toBe('group');
  });

  it('maps follow-up + initial order to BL46', async () => {
    const result = await stub.interpret(
      'When a follow-up order is placed without a qualifying initial order, prevent submission.',
      EMPTY_GROUNDING,
    );
    expect(result.candidate?.key).toBe('BL46');
    expect(result.candidate?.onFailure.type).toBe('PreventAction');
    expect(result.gaps).toHaveLength(0);
  });

  it('maps pediatric/under-19 to BL3', async () => {
    const result = await stub.interpret(
      'Assign pediatric priority for patients under 19.',
      EMPTY_GROUNDING,
    );
    expect(result.candidate?.key).toBe('BL3');
  });

  it('maps NY + validated to BL8', async () => {
    const result = await stub.interpret(
      'For NY-regulated orders the performing lab must be NY validated.',
      EMPTY_GROUNDING,
    );
    expect(result.candidate?.key).toBe('BL8');
  });

  it('proposes a structured term for an obviously-unknown concept (specimen colour)', async () => {
    const result = await stub.interpret(
      'Hold the order when the specimen colour is abnormal.',
      EMPTY_GROUNDING,
    );
    expect(result.candidate).toBeNull();
    expect(result.termProposals).toHaveLength(1);
    expect(result.termProposals[0]).toMatchObject({
      entity: 'specimen',
      field: 'colour',
      path: 'specimen.colour',
      dataType: 'String',
      entityExists: true,
    });
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('emits no term proposals for a recognised sentence', async () => {
    const result = await stub.interpret(
      'Assign pediatric priority for patients under 19.',
      EMPTY_GROUNDING,
    );
    expect(result.termProposals).toHaveLength(0);
  });

  it('returns null + a gap for gibberish (no silent invention)', async () => {
    const result = await stub.interpret(
      'asdf qwerty zxcv plover xyzzy',
      EMPTY_GROUNDING,
    );
    expect(result.candidate).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.unmappedPhrases.length).toBeGreaterThan(0);
  });

  it('is deterministic: identical inputs yield identical results', async () => {
    const a = await stub.interpret(
      'Hold the order if Technical FISH on FFPE has no circled H&E',
      EMPTY_GROUNDING,
    );
    const b = await stub.interpret(
      'Hold the order if Technical FISH on FFPE has no circled H&E',
      EMPTY_GROUNDING,
    );
    expect(a).toEqual(b);
  });
});
