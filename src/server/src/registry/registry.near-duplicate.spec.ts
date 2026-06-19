/**
 * Unit tests for {@link findNearDuplicateFields} — the synonym-accumulation guard used by
 * `addField`. Pure function, no DB. Proves the guard flags token-subset / high-overlap names
 * (the `performingLab*` family that polluted the registry) while leaving genuinely distinct
 * fields addable.
 */

import { FieldDataType, RegistryStatus, type Field } from '@prisma/client';

import { findNearDuplicateFields } from './registry.service';

/** Minimal Field factory — only the columns the guard reads matter. */
function field(
  name: string,
  status: RegistryStatus = RegistryStatus.Active,
): Field {
  return {
    id: name,
    entityId: 'order',
    name,
    dataType: FieldDataType.String,
    required: false,
    allowedValues: [],
    description: null,
    status,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as Field;
}

const ORDER_FIELDS: Field[] = [
  field('type'),
  field('performingLab'),
  field('client.nyStatus'),
  field('dischargeDate'),
];

describe('findNearDuplicateFields', () => {
  it('flags a token-superset of an existing field (performingLabRouting ⊃ performingLab)', () => {
    expect(findNearDuplicateFields('performingLabRouting', ORDER_FIELDS)).toEqual(
      ['performingLab'],
    );
  });

  it('flags deeper synonym variations (performingLabRoutingDestination)', () => {
    expect(
      findNearDuplicateFields('performingLabRoutingDestination', ORDER_FIELDS),
    ).toEqual(['performingLab']);
  });

  it('does NOT flag a genuinely distinct new field (client.program)', () => {
    expect(findNearDuplicateFields('client.program', ORDER_FIELDS)).toEqual([]);
  });

  it('does NOT flag an unrelated field (statContactInfo)', () => {
    expect(findNearDuplicateFields('statContactInfo', ORDER_FIELDS)).toEqual([]);
  });

  it('ignores the exact-name case (left to the unique constraint)', () => {
    expect(findNearDuplicateFields('performingLab', ORDER_FIELDS)).toEqual([]);
  });

  it('ignores non-Active fields when matching', () => {
    const withRetired = [field('performingLab', RegistryStatus.Deprecated)];
    expect(findNearDuplicateFields('performingLabRouting', withRetired)).toEqual(
      [],
    );
  });
});
