import { describe, it, expect } from 'vitest';
import { buildCreatePayload, type AddPropertyFormState } from './buildCreatePayload';

const base: AddPropertyFormState = {
  path: 'order.client.program',
  dataType: 'String',
  label: '',
  description: '',
};

describe('buildCreatePayload (Add property → POST body)', () => {
  it('sends only path + dataType when label and description are blank', () => {
    expect(buildCreatePayload(base)).toEqual({
      path: 'order.client.program',
      dataType: 'String',
    });
  });

  it('includes label and description only when present, trimmed', () => {
    const payload = buildCreatePayload({
      ...base,
      label: '  Client program  ',
      description: '  The ordering client program.  ',
    });
    expect(payload).toEqual({
      path: 'order.client.program',
      dataType: 'String',
      label: 'Client program',
      description: 'The ordering client program.',
    });
  });

  it('trims the path and preserves the chosen data type', () => {
    const payload = buildCreatePayload({
      ...base,
      path: '  specimen.fixationTime  ',
      dataType: 'Number',
    });
    expect(payload.path).toBe('specimen.fixationTime');
    expect(payload.dataType).toBe('Number');
  });

  it('omits whitespace-only optional fields rather than sending empty strings', () => {
    const payload = buildCreatePayload({ ...base, label: '   ', description: '   ' });
    expect(payload).not.toHaveProperty('label');
    expect(payload).not.toHaveProperty('description');
  });
});
