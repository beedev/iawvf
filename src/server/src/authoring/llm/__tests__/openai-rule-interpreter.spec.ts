/**
 * Offline tests for {@link OpenAiRuleInterpreter} with a MOCKED OpenAI client. No
 * network. These prove the model-emitted-term-proposal path: when a well-behaved
 * model DECLINES (candidateJson=null) and names the missing subject in
 * "termProposals", the interpreter — via the gate — surfaces a structured
 * {@link TermProposal} with the canonical path and a registry-checked `entityExists`.
 */

import type OpenAI from 'openai';
import { FieldDataType } from '@prisma/client';

import { ReferenceDataProvider } from '../../../vdf/reference-data';
import { JsonValue } from '../../../vdf/types';
import { SchemaValidator } from '../../schema-validator';
import { GroundingSubject, VocabularyLinter } from '../../vocabulary-linter';
import { GroundingVocabulary } from '../interpreter';
import { OPENAI_INTERPRETER_VERSION } from '../openai-rule-interpreter';
import { OpenAiRuleInterpreter } from '../openai-rule-interpreter';
import { OpenAiOptions } from '../openai.config';
import { RuleInterpretationGate } from '../rule-interpretation-gate';

class FakeReferences implements ReferenceDataProvider {
  resolve(): JsonValue | null {
    return null;
  }
  tryResolve(): { found: boolean; value: JsonValue | null } {
    return { found: false, value: null };
  }
  referenceKeys(): string[] {
    return [];
  }
}

// `order` is a known entity; `order.client.program` is NOT a known subject.
const SUBJECTS: GroundingSubject[] = [
  { path: 'order.type', dataType: FieldDataType.String, allowedValues: [] },
  {
    path: 'order.client.nyStatus',
    dataType: FieldDataType.String,
    allowedValues: [],
  },
];

const GROUNDING: GroundingVocabulary = {
  subjects: SUBJECTS,
  operators: ['Equals'],
  outcomes: ['ComplianceAlert'],
  references: [],
};

const OPTIONS: OpenAiOptions = {
  enabled: true,
  apiKey: 'test-key',
  model: 'gpt-test',
  baseUrl: 'https://example.invalid/v1',
  temperature: 0,
  timeoutMs: 1000,
};

/** A mock OpenAI client whose chat completion returns a canned envelope JSON string. */
function clientReturning(envelopeJson: string): OpenAI {
  return {
    chat: {
      completions: {
        create: (): Promise<unknown> =>
          Promise.resolve({
            choices: [{ message: { content: envelopeJson } }],
          }),
      },
    },
  } as unknown as OpenAI;
}

function makeInterpreter(envelopeJson: string): OpenAiRuleInterpreter {
  const client = clientReturning(envelopeJson);
  const gateFactory = (
    grounding: GroundingVocabulary,
  ): Promise<RuleInterpretationGate> => {
    const linter = new VocabularyLinter(
      grounding.subjects,
      new FakeReferences(),
    );
    return Promise.resolve(
      new RuleInterpretationGate(new SchemaValidator(), linter),
    );
  };
  return new OpenAiRuleInterpreter(client, OPTIONS, gateFactory);
}

describe('OpenAiRuleInterpreter — model-emitted term proposals (offline)', () => {
  it('passes a model DECLINE + termProposal through to a structured TermProposal', async () => {
    // The model declines (candidate null) and names the missing subject itself.
    const envelope = JSON.stringify({
      candidateJson: null,
      confidence: 0.8,
      unmappedPhrases: ['SCOPE program client'],
      gaps: ["No subject models 'SCOPE program client'."],
      termProposals: [
        {
          entity: 'order',
          field: 'client.program',
          dataType: 'String',
          allowedValues: ['SCOPE'],
          rationale: 'The rule scopes to a SCOPE program client.',
          phrase: 'SCOPE program client',
        },
      ],
    });

    const result = await makeInterpreter(envelope).interpret(
      'Raise a compliance alert when HST testing is ordered for a SCOPE program client.',
      GROUNDING,
    );

    expect(result.candidate).toBeNull();
    expect(result.interpreterVersion).toBe(OPENAI_INTERPRETER_VERSION);
    expect(result.termProposals).toHaveLength(1);
    expect(result.termProposals[0]).toMatchObject({
      entity: 'order',
      field: 'client.program',
      path: 'order.client.program',
      dataType: 'String',
      entityExists: true, // `order` is a known registry entity.
      allowedValues: ['SCOPE'],
    });
    // The gap text is still surfaced.
    expect(result.gaps.some((g) => /SCOPE program client/.test(g))).toBe(true);
  });

  it('defaults a model proposal with no dataType to String and entityExists from the registry', async () => {
    const envelope = JSON.stringify({
      candidateJson: null,
      confidence: 0.5,
      unmappedPhrases: [],
      gaps: ['needs a kit weight'],
      termProposals: [
        {
          entity: 'kit',
          field: 'weight',
          dataType: null,
          allowedValues: null,
          rationale: 'Heavy kits need a hold.',
          phrase: null,
        },
      ],
    });

    const result = await makeInterpreter(envelope).interpret(
      'Hold heavy kits.',
      GROUNDING,
    );

    expect(result.termProposals).toHaveLength(1);
    expect(result.termProposals[0]).toMatchObject({
      entity: 'kit',
      field: 'weight',
      path: 'kit.weight',
      dataType: 'String', // defaulted
      entityExists: false, // `kit` is not a known entity
    });
    expect(result.termProposals[0].allowedValues).toBeUndefined();
  });

  it('drops a model proposal that is actually already grounded', async () => {
    const envelope = JSON.stringify({
      candidateJson: null,
      confidence: 0.4,
      unmappedPhrases: [],
      gaps: ['x'],
      termProposals: [
        {
          entity: 'order',
          field: 'type', // order.type IS a known subject
          dataType: 'String',
          allowedValues: null,
          rationale: 'r',
          phrase: null,
        },
      ],
    });

    const result = await makeInterpreter(envelope).interpret(
      'anything',
      GROUNDING,
    );
    expect(result.termProposals).toHaveLength(0);
  });
});
