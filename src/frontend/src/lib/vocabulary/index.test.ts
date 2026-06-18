import { describe, it, expect } from 'vitest';
import {
  canAdminVocabulary,
  composeFieldPath,
  FIELD_DATA_TYPES,
  humanizeLabel,
  isValidEntityKey,
  isValidFieldName,
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
    const authorRoles: VdfRole[] = ['Author'];
    const adminRoles: VdfRole[] = ['Admin'];
    expect(canAdminVocabulary(authorRoles)).toBe(false);
    expect(canAdminVocabulary(adminRoles)).toBe(true);
  });
});

describe('isValidEntityKey (mirrors server ENTITY_KEY_PATTERN — single segment)', () => {
  it('accepts a single identifier segment', () => {
    expect(isValidEntityKey('kit')).toBe(true);
    expect(isValidEntityKey('specimen')).toBe(true);
    expect(isValidEntityKey('medicalReview')).toBe(true);
    expect(isValidEntityKey('order2')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidEntityKey('  kit  ')).toBe(true);
  });

  it('rejects dotted, empty, or illegally-charactered keys', () => {
    expect(isValidEntityKey('')).toBe(false);
    expect(isValidEntityKey('   ')).toBe(false);
    expect(isValidEntityKey(null)).toBe(false);
    expect(isValidEntityKey(undefined)).toBe(false);
    expect(isValidEntityKey('order.client')).toBe(false); // dotted = field name, not entity key
    expect(isValidEntityKey('1kit')).toBe(false);
    expect(isValidEntityKey('kit-2')).toBe(false);
    expect(isValidEntityKey('kit[]')).toBe(false);
  });
});

describe('isValidFieldName (mirrors server FIELD_NAME_PATTERN — dotted, optional [])', () => {
  it('accepts single and dotted segments', () => {
    expect(isValidFieldName('fixationTime')).toBe(true);
    expect(isValidFieldName('client.nyStatus')).toBe(true);
    expect(isValidFieldName('client.program')).toBe(true);
  });

  it('accepts an optional trailing [] collection marker', () => {
    expect(isValidFieldName('tests[]')).toBe(true);
    expect(isValidFieldName('specimens[]')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidFieldName('  client.nyStatus  ')).toBe(true);
  });

  it('rejects empty or malformed names', () => {
    expect(isValidFieldName('')).toBe(false);
    expect(isValidFieldName(null)).toBe(false);
    expect(isValidFieldName('.client')).toBe(false);
    expect(isValidFieldName('client.')).toBe(false);
    expect(isValidFieldName('client..program')).toBe(false);
    expect(isValidFieldName('1client')).toBe(false);
    expect(isValidFieldName('client-program')).toBe(false);
    expect(isValidFieldName('client.program[]extra')).toBe(false);
  });
});

describe('humanizeLabel', () => {
  it('capitalizes a single-word key', () => {
    expect(humanizeLabel('kit')).toBe('Kit');
    expect(humanizeLabel('specimen')).toBe('Specimen');
  });

  it('splits camelCase into words', () => {
    expect(humanizeLabel('medicalReview')).toBe('Medical review');
    expect(humanizeLabel('priorTimepoint')).toBe('Prior timepoint');
  });

  it('handles empty input', () => {
    expect(humanizeLabel('')).toBe('');
    expect(humanizeLabel('   ')).toBe('');
  });
});

describe('composeFieldPath', () => {
  it('joins an entity key and field name with a dot', () => {
    expect(composeFieldPath('specimen', 'fixationTime')).toBe('specimen.fixationTime');
    expect(composeFieldPath('order', 'client.nyStatus')).toBe('order.client.nyStatus');
  });

  it('trims parts and returns empty when either is blank', () => {
    expect(composeFieldPath('  specimen  ', '  fixationTime ')).toBe('specimen.fixationTime');
    expect(composeFieldPath('', 'fixationTime')).toBe('');
    expect(composeFieldPath('specimen', '')).toBe('');
  });
});

describe('FIELD_DATA_TYPES', () => {
  it('exposes the closed engine grammar in display order', () => {
    expect(FIELD_DATA_TYPES).toEqual(['String', 'Number', 'Date', 'Boolean', 'Collection']);
  });
});
