import { describe, it, expect } from 'vitest';
import {
  canAdminVocabulary,
  deriveObjectName,
  isValidSubjectPath,
  SUBJECT_DATA_TYPES,
} from './index';
import type { VdfRole } from '../types/api';

describe('canAdminVocabulary (nav + route gating)', () => {
  it('grants access only when roles include Admin', () => {
    expect(canAdminVocabulary(['Admin'])).toBe(true);
    expect(canAdminVocabulary(['Author', 'Reviewer', 'Admin'])).toBe(true);
  });

  it('hides the Vocabulary surface from non-admins', () => {
    expect(canAdminVocabulary(['Author'])).toBe(false);
    expect(canAdminVocabulary(['Reviewer'])).toBe(false);
    expect(canAdminVocabulary(['Author', 'Reviewer'])).toBe(false);
  });

  it('treats absent / empty roles as no access', () => {
    expect(canAdminVocabulary(null)).toBe(false);
    expect(canAdminVocabulary(undefined)).toBe(false);
    expect(canAdminVocabulary([])).toBe(false);
  });

  it('is the single source of truth for both the nav item and the route guard', () => {
    // The same predicate gates the rail item (AppShell) and the AdminRoute redirect (App).
    const authorRoles: VdfRole[] = ['Author'];
    const adminRoles: VdfRole[] = ['Admin'];
    expect(canAdminVocabulary(authorRoles)).toBe(false);
    expect(canAdminVocabulary(adminRoles)).toBe(true);
  });
});

describe('isValidSubjectPath (mirrors backend VocabularyPathConventions)', () => {
  it('accepts single and dotted segments', () => {
    expect(isValidSubjectPath('client')).toBe(true);
    expect(isValidSubjectPath('client.program')).toBe(true);
    expect(isValidSubjectPath('order.client.program')).toBe(true);
    expect(isValidSubjectPath('specimen.fixationTime')).toBe(true);
  });

  it('accepts an optional trailing [] collection marker', () => {
    expect(isValidSubjectPath('order.tests[]')).toBe(true);
    expect(isValidSubjectPath('tests[]')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidSubjectPath('  client.program  ')).toBe(true);
  });

  it('rejects empty, malformed, or illegally-charactered paths', () => {
    expect(isValidSubjectPath('')).toBe(false);
    expect(isValidSubjectPath('   ')).toBe(false);
    expect(isValidSubjectPath(null)).toBe(false);
    expect(isValidSubjectPath(undefined)).toBe(false);
    expect(isValidSubjectPath('.client')).toBe(false);
    expect(isValidSubjectPath('client.')).toBe(false);
    expect(isValidSubjectPath('client..program')).toBe(false);
    expect(isValidSubjectPath('1client')).toBe(false);
    expect(isValidSubjectPath('client-program')).toBe(false);
    expect(isValidSubjectPath('client.program[]extra')).toBe(false);
  });
});

describe('deriveObjectName', () => {
  it('returns the first dotted segment', () => {
    expect(deriveObjectName('order.client.program')).toBe('order');
    expect(deriveObjectName('specimen.fixationTime')).toBe('specimen');
  });

  it('strips a trailing [] collection marker from the first segment', () => {
    expect(deriveObjectName('order.tests[]')).toBe('order');
    expect(deriveObjectName('tests[]')).toBe('tests');
  });

  it('handles a single-segment path and empty input', () => {
    expect(deriveObjectName('client')).toBe('client');
    expect(deriveObjectName('')).toBe('');
    expect(deriveObjectName('   ')).toBe('');
  });
});

describe('SUBJECT_DATA_TYPES', () => {
  it('exposes the closed engine grammar in display order', () => {
    expect(SUBJECT_DATA_TYPES).toEqual(['String', 'Number', 'Date', 'Boolean', 'Collection']);
  });
});
