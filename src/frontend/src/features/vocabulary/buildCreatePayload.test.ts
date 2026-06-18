import { describe, it, expect } from 'vitest';
import {
  buildAddFieldPayload,
  buildCreateEntityPayload,
  type AddEntityFormState,
  type AddFieldFormState,
} from './buildCreatePayload';

const entityBase: AddEntityFormState = { key: 'kit', label: '', description: '' };

describe('buildCreateEntityPayload (Add entity → POST body)', () => {
  it('sends only key when label and description are blank', () => {
    expect(buildCreateEntityPayload(entityBase)).toEqual({ key: 'kit' });
  });

  it('includes label and description only when present, trimmed', () => {
    const payload = buildCreateEntityPayload({
      ...entityBase,
      label: '  Kit  ',
      description: '  A reagent kit.  ',
    });
    expect(payload).toEqual({ key: 'kit', label: 'Kit', description: 'A reagent kit.' });
  });

  it('trims the key', () => {
    expect(buildCreateEntityPayload({ ...entityBase, key: '  specimen  ' }).key).toBe('specimen');
  });

  it('omits whitespace-only optional fields rather than sending empty strings', () => {
    const payload = buildCreateEntityPayload({ ...entityBase, label: '   ', description: '   ' });
    expect(payload).not.toHaveProperty('label');
    expect(payload).not.toHaveProperty('description');
  });
});

const fieldBase: AddFieldFormState = {
  entityKey: 'specimen',
  name: 'fixationTime',
  dataType: 'Number',
  allowedValues: [],
  description: '',
};

describe('buildAddFieldPayload (Add field → POST body; entity supplied separately)', () => {
  it('does NOT include the entity key in the body (it is the route segment)', () => {
    const payload = buildAddFieldPayload(fieldBase);
    expect(payload).not.toHaveProperty('entityKey');
    expect(payload).toEqual({ name: 'fixationTime', dataType: 'Number' });
  });

  it('trims the name and preserves the chosen data type', () => {
    const payload = buildAddFieldPayload({
      ...fieldBase,
      name: '  client.nyStatus  ',
      dataType: 'String',
    });
    expect(payload.name).toBe('client.nyStatus');
    expect(payload.dataType).toBe('String');
  });

  it('normalizes allowedValues: trim, drop blanks, de-duplicate, preserve order', () => {
    const payload = buildAddFieldPayload({
      ...fieldBase,
      dataType: 'String',
      allowedValues: ['  Standard ', 'Priority', '', '   ', 'Standard'],
    });
    expect(payload.allowedValues).toEqual(['Standard', 'Priority']);
  });

  it('omits an empty allowedValues array and a blank description', () => {
    const payload = buildAddFieldPayload({ ...fieldBase, allowedValues: ['  '], description: '  ' });
    expect(payload).not.toHaveProperty('allowedValues');
    expect(payload).not.toHaveProperty('description');
  });

  it('includes description when present, trimmed', () => {
    const payload = buildAddFieldPayload({ ...fieldBase, description: '  Hours in fixative.  ' });
    expect(payload.description).toBe('Hours in fixative.');
  });
});
