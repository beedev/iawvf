/**
 * Offline tests for {@link RuleInterpreterService.interpretWithEvaluation} — the
 * SANDBOX proposal-evaluation flow. No network, no Postgres.
 *
 * The primary {@link IRuleInterpreter} is a hand-scripted fake whose two calls (the
 * BASE interpret and the single SANDBOX re-interpret) return canned results, so we can
 * assert the evaluation logic precisely:
 *  - proposals that demonstrably help are KEPT with `improves=true` + a projected
 *    confidence;
 *  - proposals the sandbox does NOT improve are DROPPED with `improves=false`;
 *  - a proposal duplicating an existing subject is deduped WITHOUT any sandbox call
 *    (exactly one interpret call total).
 *
 * The real {@link LlmGroundingService.augment} is exercised (it is pure, in-memory),
 * while {@link LlmGroundingService.buildScoped} is faked to a fixed vocabulary so the
 * service has no DB dependency.
 */

import { FieldDataType } from '@prisma/client';

import {
  GroundingVocabulary,
  InterpretationResult,
  IRuleInterpreter,
  TermProposal,
} from '../interpreter';
import { LlmGroundingService } from '../llm-grounding.service';
import { RuleInterpreterService } from '../rule-interpreter.service';
import { StubRuleInterpreter } from '../stub-rule-interpreter';

import { GroundedSubject } from '../../../rules/vocabulary-projection.service';
import { GroundingSubject } from '../../vocabulary-linter';
import { RuleDefinition } from '../../../vdf/types';

const NL = 'Raise a compliance alert when the client is in the SCOPE program.';

/** A minimal grounded subject set the faked `buildScoped` returns. */
const BASE_SUBJECTS: GroundingSubject[] = [
  { path: 'order.type', dataType: FieldDataType.String, allowedValues: [] },
  {
    path: 'order.performingLab',
    dataType: FieldDataType.String,
    allowedValues: [],
  },
];

const BASE_VOCAB: GroundingVocabulary = {
  subjects: BASE_SUBJECTS,
  operators: ['Equals', 'IsPresent', 'InSet'],
  outcomes: ['ComplianceAlert', 'Continue'],
  references: [],
};

/** A throwaway valid-shaped rule used as a candidate in scripted sandbox results. */
function fakeRule(key: string): RuleDefinition {
  return {
    key,
    name: key,
    priority: 0,
    phase: 'Validate',
    enabled: true,
    version: 1,
    effectiveDate: '0001-01-01T00:00:00+00:00',
    assert: { type: 'leaf', subject: 'order.type', operator: 'IsPresent' },
    onSuccess: { type: 'Continue', parameters: {} },
    onFailure: {
      type: 'ComplianceAlert',
      scope: 'order',
      reason: 'x',
      severity: 'informational',
      parameters: {},
    },
  };
}

function result(over: Partial<InterpretationResult>): InterpretationResult {
  return {
    candidate: null,
    confidence: 0,
    unmappedPhrases: [],
    gaps: [],
    termProposals: [],
    naturalLanguage: NL,
    interpreterVersion: 'fake/1.0.0',
    model: 'fake',
    ...over,
  };
}

const PROGRAM_PROPOSAL: TermProposal = {
  entity: 'order',
  field: 'client.program',
  path: 'order.client.program',
  dataType: 'String',
  entityExists: true,
  rationale: 'The rule needs order.client.program.',
};

/**
 * A scripted primary interpreter: returns the queued result for each successive
 * `interpret` call and records how many calls (and with which vocabularies) it saw.
 */
class ScriptedInterpreter implements IRuleInterpreter {
  readonly calls: GroundingVocabulary[] = [];
  constructor(private readonly queue: InterpretationResult[]) {}
  interpret(
    _nl: string,
    grounding: GroundingVocabulary,
  ): Promise<InterpretationResult> {
    this.calls.push(grounding);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error('ScriptedInterpreter: unexpected extra interpret call');
    }
    return Promise.resolve(next);
  }
}

/**
 * Builds the service with a faked grounding: `buildScoped` returns a fixed vocabulary
 * (no DB), while `augment` delegates to the REAL pure implementation so the sandbox
 * vocabulary genuinely contains the proposed terms.
 */
function buildService(primary: IRuleInterpreter): RuleInterpreterService {
  // A real LlmGroundingService instance — its dependencies are never used because we
  // only call the pure `augment` method (buildScoped is overridden below).
  const real = new LlmGroundingService(undefined as never, undefined as never);
  const grounding = {
    buildScoped: (
      subjects: readonly GroundedSubject[],
    ): Promise<GroundingVocabulary> => {
      void subjects;
      return Promise.resolve(BASE_VOCAB);
    },
    augment: (base: GroundingVocabulary, proposals: readonly TermProposal[]) =>
      real.augment(base, proposals),
  } as unknown as LlmGroundingService;
  const stub = new StubRuleInterpreter();
  return new RuleInterpreterService(grounding, primary, stub);
}

describe('RuleInterpreterService.interpretWithEvaluation', () => {
  it('keeps proposals + sets improves=true when the sandbox grounds a higher-confidence candidate', async () => {
    const primary = new ScriptedInterpreter([
      // BASE: no candidate, a proposal, one unmapped phrase.
      result({
        candidate: null,
        confidence: 0,
        unmappedPhrases: ['SCOPE program'],
        termProposals: [PROGRAM_PROPOSAL],
      }),
      // SANDBOX: grounded candidate, higher confidence, no unmapped phrases.
      result({
        candidate: fakeRule('R-SCOPE'),
        confidence: 0.9,
        unmappedPhrases: [],
      }),
    ]);
    const service = buildService(primary);

    const out = await service.interpretWithEvaluation(NL, []);

    expect(primary.calls).toHaveLength(2);
    // Sandbox call grounding includes the proposed term.
    expect(
      primary.calls[1].subjects.some((s) => s.path === 'order.client.program'),
    ).toBe(true);

    expect(out.termProposals).toHaveLength(1);
    expect(out.termProposals[0].path).toBe('order.client.program');
    expect(out.proposalEvaluation).not.toBeNull();
    expect(out.proposalEvaluation?.improves).toBe(true);
    expect(out.proposalEvaluation?.baselineConfidence).toBe(0);
    expect(out.proposalEvaluation?.projectedConfidence).toBe(0.9);
    expect(out.proposalEvaluation?.groundsCandidate).toBe(true);
    expect(out.proposalEvaluation?.baselineHadCandidate).toBe(false);
    expect(out.proposalEvaluation?.unmappedBefore).toBe(1);
    expect(out.proposalEvaluation?.unmappedAfter).toBe(0);
    // The base candidate (current vocab) is returned, not the sandbox one.
    expect(out.candidate).toBeNull();
  });

  it('drops proposals + sets improves=false when the sandbox does not improve', async () => {
    const primary = new ScriptedInterpreter([
      // BASE: already has a candidate at 0.8 with the proposal still surfaced.
      result({
        candidate: fakeRule('R-BASE'),
        confidence: 0.8,
        unmappedPhrases: [],
        termProposals: [PROGRAM_PROPOSAL],
      }),
      // SANDBOX: candidate but NO confidence gain and NO fewer unmapped phrases.
      result({
        candidate: fakeRule('R-SB'),
        confidence: 0.8,
        unmappedPhrases: [],
      }),
    ]);
    const service = buildService(primary);

    const out = await service.interpretWithEvaluation(NL, []);

    expect(primary.calls).toHaveLength(2);
    expect(out.termProposals).toEqual([]);
    expect(out.proposalEvaluation).not.toBeNull();
    expect(out.proposalEvaluation?.improves).toBe(false);
    expect(out.proposalEvaluation?.projectedConfidence).toBe(0.8);
    // The (real, current-vocab) base candidate still stands.
    expect(out.candidate).not.toBeNull();
  });

  it('dedupes a proposal duplicating an existing subject WITHOUT any sandbox call', async () => {
    const redundant: TermProposal = {
      // `order.performingLab` is already a known subject in BASE_VOCAB — the classic
      // redundant "performing lab routing" proposal. Differently-cased to prove the
      // match is case-insensitive.
      entity: 'order',
      field: 'PerformingLab',
      path: 'order.PerformingLab',
      dataType: 'String',
      entityExists: true,
      rationale: 'Routing by performing lab.',
    };
    const primary = new ScriptedInterpreter([
      // BASE only: a usable candidate plus the redundant proposal.
      result({
        candidate: fakeRule('R-NY'),
        confidence: 0.85,
        unmappedPhrases: [],
        termProposals: [redundant],
      }),
    ]);
    const service = buildService(primary);

    const out = await service.interpretWithEvaluation(NL, []);

    // Crucially: exactly ONE interpret call — the redundant proposal was dropped
    // deterministically, so no sandbox re-interpretation occurred.
    expect(primary.calls).toHaveLength(1);
    expect(out.termProposals).toEqual([]);
    expect(out.proposalEvaluation).toBeNull();
    expect(out.candidate).not.toBeNull();
  });
});
