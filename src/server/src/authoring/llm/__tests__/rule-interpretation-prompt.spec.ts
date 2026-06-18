/**
 * Offline tests for the grounding prompt builder. Proves the system prompt is
 * constrained to the supplied registry vocabulary: it enumerates the exact subjects,
 * operators, reference keys, and outcomes — and nothing invented.
 */

import { FieldDataType } from '@prisma/client';

import { GroundingVocabulary } from '../interpreter';
import {
  buildSystemPrompt,
  buildUserPrompt,
} from '../rule-interpretation-prompt';

const VOCAB: GroundingVocabulary = {
  subjects: [
    {
      path: 'specimen.fixationTime',
      dataType: FieldDataType.Number,
      allowedValues: [],
    },
    {
      path: 'specimen.type',
      dataType: FieldDataType.String,
      allowedValues: ['FFPE', 'FreshFrozen'],
    },
    { path: 'patient.age', dataType: FieldDataType.Number, allowedValues: [] },
  ],
  operators: ['Equals', 'IsPresent', 'LessThan'],
  outcomes: ['CompleteHold', 'Continue', 'PreventAction'],
  references: ['PolicyThresholds', 'TechnicalFISH'],
};

describe('rule-interpretation-prompt (offline)', () => {
  const prompt = buildSystemPrompt(VOCAB);

  it('enumerates the registry subjects (e.g. specimen.fixationTime) with types', () => {
    expect(prompt).toContain('specimen.fixationTime : Number');
    expect(prompt).toContain('patient.age : Number');
  });

  it('surfaces allowedValues for closed-set subjects', () => {
    expect(prompt).toContain('specimen.type : String');
    expect(prompt).toMatch(
      /specimen\.type : String \(allowed: FFPE, FreshFrozen\)/,
    );
  });

  it('lists the legal operators', () => {
    expect(prompt).toContain('LEGAL OPERATORS');
    expect(prompt).toContain('- Equals');
    expect(prompt).toContain('- IsPresent');
    expect(prompt).toContain('- LessThan');
  });

  it('lists the legal outcomes', () => {
    expect(prompt).toContain('LEGAL OUTCOME TYPES');
    expect(prompt).toContain('- CompleteHold');
    expect(prompt).toContain('- PreventAction');
  });

  it('lists the legal reference keys', () => {
    expect(prompt).toContain('LEGAL REFERENCE KEYS');
    expect(prompt).toContain('- PolicyThresholds');
    expect(prompt).toContain('- TechnicalFISH');
  });

  it('states the no-invention / grounding constraint', () => {
    expect(prompt).toMatch(/GROUNDING, NOT GUESSING/);
    expect(prompt).toMatch(/NO SILENT INVENTION/);
  });

  it('is deterministic for a given vocabulary', () => {
    expect(buildSystemPrompt(VOCAB)).toBe(prompt);
  });

  it('user prompt carries the natural-language text', () => {
    const user = buildUserPrompt('  hold orders without H&E  ');
    expect(user).toContain('hold orders without H&E');
    expect(user).toContain('controlled vocabulary');
  });
});
