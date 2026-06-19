/**
 * Offline tests for the deterministic {@link RuleInterpretationGate}. No network.
 *
 * The gate is fed canned {@link ModelEnvelope}s and a registry-grounded
 * {@link VocabularyLinter} built from hand-specified subjects (so the suite needs no
 * Postgres). These prove the "no silent invention" contract:
 *  - an envelope referencing an UNKNOWN subject is rejected (candidate null) + gap;
 *  - a clean PM17-like envelope yields a valid candidate;
 *  - a type-mismatch (numeric op on a String field) keeps the candidate but adds a
 *    lint-warning gap and dampens confidence.
 */

import { FieldDataType } from '@prisma/client';

import { ReferenceDataProvider } from '../../../vdf/reference-data';
import { JsonValue } from '../../../vdf/types';
import { SchemaValidator } from '../../schema-validator';
import { GroundingSubject, VocabularyLinter } from '../../vocabulary-linter';
import {
  GateProvenance,
  RuleInterpretationGate,
} from '../rule-interpretation-gate';
import { ModelEnvelope } from '../model-envelope';

/** A tiny in-memory reference provider keyed by a known set. */
class FakeReferences implements ReferenceDataProvider {
  constructor(private readonly keys: Set<string>) {}
  resolve(key: string): JsonValue | null {
    return this.keys.has(key) ? [] : null;
  }
  tryResolve(key: string): { found: boolean; value: JsonValue | null } {
    return { found: this.keys.has(key), value: this.keys.has(key) ? [] : null };
  }
  referenceKeys(): string[] {
    return [...this.keys].sort((a, b) => a.localeCompare(b));
  }
}

const SUBJECTS: GroundingSubject[] = [
  { path: 'test.code', dataType: FieldDataType.String, allowedValues: [] },
  {
    path: 'test.specimen.type',
    dataType: FieldDataType.String,
    allowedValues: [],
  },
  {
    path: 'document.circledHE',
    dataType: FieldDataType.Boolean,
    allowedValues: [],
  },
  { path: 'patient.gender', dataType: FieldDataType.String, allowedValues: [] },
  // `order` is a known entity (so order.client.program is "add a field to order"),
  // and specimen.fixationTime is a fully grounded numeric subject.
  { path: 'order.type', dataType: FieldDataType.String, allowedValues: [] },
  {
    path: 'specimen.fixationTime',
    dataType: FieldDataType.Number,
    allowedValues: [],
  },
];

const PROVENANCE: GateProvenance = {
  naturalLanguage: 'some rule',
  interpreterVersion: 'test/1.0.0',
  model: 'test-model',
};

function makeGate(): RuleInterpretationGate {
  const references = new FakeReferences(new Set(['TechnicalFISH']));
  const linter = new VocabularyLinter(SUBJECTS, references);
  return new RuleInterpretationGate(new SchemaValidator(), linter);
}

/** A clean, schema-valid, lint-clean PM17-like rule. */
const CLEAN_PM17_JSON = JSON.stringify({
  key: 'PM17',
  name: 'Circled H&E required for Technical FISH on FFPE',
  priority: 10,
  phase: 'Validate',
  appliesWhen: {
    type: 'group',
    logicalOp: 'All',
    conditions: [
      {
        type: 'leaf',
        subject: 'test.code',
        operator: 'InSet',
        reference: 'TechnicalFISH',
      },
      {
        type: 'leaf',
        subject: 'test.specimen.type',
        operator: 'Equals',
        value: 'FFPE',
      },
    ],
  },
  assert: {
    type: 'leaf',
    subject: 'document.circledHE',
    operator: 'IsPresent',
  },
  onSuccess: { type: 'Continue' },
  onFailure: { type: 'CompleteHold', scope: 'order', reason: 'missing H&E' },
});

describe('RuleInterpretationGate (offline)', () => {
  it('accepts a clean PM17-like envelope -> valid candidate', () => {
    const envelope: ModelEnvelope = {
      candidateJson: CLEAN_PM17_JSON,
      confidence: 0.9,
      unmappedPhrases: [],
      gaps: [],
    };
    const result = makeGate().validate(envelope, PROVENANCE);

    expect(result.candidate).not.toBeNull();
    expect(result.candidate!.key).toBe('PM17');
    expect(result.confidence).toBe(0.9);
    expect(result.gaps).toHaveLength(0);
    // Provenance is captured.
    expect(result.interpreterVersion).toBe('test/1.0.0');
    expect(result.model).toBe('test-model');
  });

  it('rejects an UNKNOWN subject ("specimen.colour") -> candidate null + propose-new-term gap', () => {
    const ruleJson = JSON.stringify({
      key: 'NL1',
      name: 'Unknown subject',
      onSuccess: { type: 'Continue' },
      onFailure: { type: 'CompleteHold', scope: 'order', reason: 'x' },
      assert: {
        type: 'leaf',
        subject: 'specimen.colour',
        operator: 'Equals',
        value: 'blue',
      },
    });
    const envelope: ModelEnvelope = {
      candidateJson: ruleJson,
      confidence: 0.8,
      unmappedPhrases: [],
      gaps: [],
    };
    const result = makeGate().validate(envelope, PROVENANCE);

    expect(result.candidate).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.gaps.some((g) => /specimen\.colour/.test(g))).toBe(true);
    expect(result.gaps.some((g) => /vocabulary-change request/.test(g))).toBe(
      true,
    );
  });

  it('keeps a type-mismatch candidate but adds a LINT020 warning gap and dampens confidence', () => {
    // GreaterThan (numeric/range) on patient.gender (a String field) is a warning.
    const ruleJson = JSON.stringify({
      key: 'NL2',
      name: 'Numeric op on string field',
      onSuccess: { type: 'Continue' },
      onFailure: { type: 'Warning', scope: 'test', reason: 'check' },
      assert: {
        type: 'leaf',
        subject: 'patient.gender',
        operator: 'GreaterThan',
        value: 'X',
      },
    });
    const envelope: ModelEnvelope = {
      candidateJson: ruleJson,
      confidence: 0.8,
      unmappedPhrases: [],
      gaps: [],
    };
    const result = makeGate().validate(envelope, PROVENANCE);

    expect(result.candidate).not.toBeNull();
    // Confidence dampened by the 0.75 warning factor.
    expect(result.confidence).toBeCloseTo(0.6, 5);
    expect(result.gaps.some((g) => /LINT020/.test(g))).toBe(true);
  });

  it('rejects a schema-invalid candidate (missing onFailure) -> candidate null + gap', () => {
    const ruleJson = JSON.stringify({
      key: 'NL3',
      name: 'No onFailure',
      onSuccess: { type: 'Continue' },
    });
    const envelope: ModelEnvelope = {
      candidateJson: ruleJson,
      confidence: 0.7,
      unmappedPhrases: [],
      gaps: [],
    };
    const result = makeGate().validate(envelope, PROVENANCE);

    expect(result.candidate).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.gaps.some((g) => /schema validation/.test(g))).toBe(true);
  });

  it('honours a model-declined candidate (null candidateJson) and adds a default gap', () => {
    const envelope: ModelEnvelope = {
      candidateJson: null,
      confidence: 0.1,
      unmappedPhrases: ['cold-ischemia time'],
      gaps: [],
    };
    const result = makeGate().validate(envelope, PROVENANCE);

    expect(result.candidate).toBeNull();
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.unmappedPhrases).toContain('cold-ischemia time');
    // No candidate deserialized -> no synthesized proposals.
    expect(result.termProposals).toHaveLength(0);
  });

  // ── Structured term-proposal synthesis (LINT001 → TermProposal) ─────────────

  it('synthesizes a TermProposal for an unknown subject on an EXISTING entity (order.client.program Equals "SCOPE")', () => {
    const ruleJson = JSON.stringify({
      key: 'NLP1',
      name: 'Scope program orders',
      onSuccess: { type: 'Continue' },
      onFailure: { type: 'CompleteHold', scope: 'order', reason: 'x' },
      assert: {
        type: 'leaf',
        subject: 'order.client.program',
        operator: 'Equals',
        value: 'SCOPE',
      },
    });
    const result = makeGate().validate(
      {
        candidateJson: ruleJson,
        confidence: 0.8,
        unmappedPhrases: [],
        gaps: [],
      },
      PROVENANCE,
    );

    // Candidate suppressed by LINT001.
    expect(result.candidate).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.gaps.some((g) => /LINT001/.test(g))).toBe(true);

    expect(result.termProposals).toHaveLength(1);
    expect(result.termProposals[0]).toMatchObject({
      entity: 'order',
      field: 'client.program',
      path: 'order.client.program',
      dataType: 'String',
      entityExists: true,
      allowedValues: ['SCOPE'],
    });
  });

  it('normalizes a MODEL-emitted proposal with a nested split (entity="order.client") to the canonical entity ("order")', () => {
    const result = makeGate().validate(
      {
        candidateJson: null,
        confidence: 0.1,
        unmappedPhrases: ['SCOPE program client'],
        gaps: [],
        termProposals: [
          {
            entity: 'order.client',
            field: 'program',
            dataType: 'String',
            allowedValues: ['SCOPE'],
          },
        ],
      },
      PROVENANCE,
    );

    expect(result.termProposals).toHaveLength(1);
    // entity must be the first path segment (a real registry entity the UI can add a field to),
    // NOT the model's raw "order.client" split.
    expect(result.termProposals[0]).toMatchObject({
      entity: 'order',
      field: 'client.program',
      path: 'order.client.program',
      dataType: 'String',
      entityExists: true,
      allowedValues: ['SCOPE'],
    });
  });

  it('synthesizes a TermProposal for an unknown subject on a NEW entity (kit.weight GreaterThan 5 → Number, entityExists false)', () => {
    const ruleJson = JSON.stringify({
      key: 'NLP2',
      name: 'Heavy kit hold',
      onSuccess: { type: 'Continue' },
      onFailure: { type: 'CompleteHold', scope: 'order', reason: 'x' },
      assert: {
        type: 'leaf',
        subject: 'kit.weight',
        operator: 'GreaterThan',
        value: 5,
      },
    });
    const result = makeGate().validate(
      {
        candidateJson: ruleJson,
        confidence: 0.8,
        unmappedPhrases: [],
        gaps: [],
      },
      PROVENANCE,
    );

    expect(result.candidate).toBeNull();
    expect(result.termProposals).toHaveLength(1);
    expect(result.termProposals[0]).toMatchObject({
      entity: 'kit',
      field: 'weight',
      path: 'kit.weight',
      dataType: 'Number',
      entityExists: false,
    });
    expect(result.termProposals[0].allowedValues).toBeUndefined();
  });

  it('emits NO term proposals for a fully-grounded candidate (specimen.fixationTime WithinRange)', () => {
    const ruleJson = JSON.stringify({
      key: 'NLP3',
      name: 'Fixation time window',
      onSuccess: { type: 'Continue' },
      onFailure: { type: 'Warning', scope: 'specimen', reason: 'x' },
      assert: {
        type: 'leaf',
        subject: 'specimen.fixationTime',
        operator: 'WithinRange',
        value: [6, 72],
      },
    });
    const result = makeGate().validate(
      {
        candidateJson: ruleJson,
        confidence: 0.9,
        unmappedPhrases: [],
        gaps: [],
      },
      PROVENANCE,
    );

    expect(result.candidate).not.toBeNull();
    expect(result.termProposals).toHaveLength(0);
  });
});
