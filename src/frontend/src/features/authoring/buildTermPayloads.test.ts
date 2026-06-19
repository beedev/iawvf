import { describe, it, expect } from 'vitest';
import {
  buildAddFieldPayload,
  buildCreateEntityPayload,
  initialTermForm,
} from './buildTermPayloads';
import type { TermProposal } from '../../lib/types/api';

const EXISTING: TermProposal = {
  phrase: 'fixation time',
  entity: 'specimen',
  field: 'fixationTime',
  path: 'specimen.fixationTime',
  dataType: 'Number',
  entityExists: true,
  rationale: 'Phrase implies a numeric duration on the specimen.',
};

const NEW_ENTITY: TermProposal = {
  entity: 'courier',
  field: 'carrier',
  path: 'courier.carrier',
  dataType: 'String',
  allowedValues: ['FedEx', 'UPS', 'FedEx'], // intentional duplicate to assert de-dup
  entityExists: false,
  rationale: 'No "courier" entity yet; the phrase names a shipping carrier.',
};

describe('initialTermForm', () => {
  it('seeds the form from the proposal type and de-duplicated allowed values', () => {
    expect(initialTermForm(EXISTING)).toEqual({ dataType: 'Number', allowedValues: [] });
    expect(initialTermForm(NEW_ENTITY)).toEqual({
      dataType: 'String',
      allowedValues: ['FedEx', 'UPS'],
    });
  });
});

describe('buildAddFieldPayload', () => {
  it('uses the proposal field name + the (edited) form type; omits an empty allowedValues', () => {
    const payload = buildAddFieldPayload(EXISTING, { dataType: 'Date', allowedValues: [] });
    expect(payload).toEqual({ name: 'fixationTime', dataType: 'Date' });
    expect('allowedValues' in payload).toBe(false);
  });

  it('includes a normalized allowedValues set when present', () => {
    const payload = buildAddFieldPayload(NEW_ENTITY, {
      dataType: 'String',
      allowedValues: [' FedEx ', 'UPS', 'UPS', ''],
    });
    expect(payload).toEqual({ name: 'carrier', dataType: 'String', allowedValues: ['FedEx', 'UPS'] });
  });
});

describe('buildCreateEntityPayload', () => {
  it('sends only the trimmed entity key (server derives the label)', () => {
    expect(buildCreateEntityPayload(NEW_ENTITY)).toEqual({ key: 'courier' });
  });
});
