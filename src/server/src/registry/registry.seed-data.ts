/**
 * Canonical seed data for the entity registry.
 *
 * Derived directly from the .NET source of truth
 * `src/backend/IAW.Vdf.Abstractions/Vocabulary/VocabularyCatalog.cs`
 * (the `Default()` catalog's `AddSubject("<path>", SubjectDataType.<Type>)`
 * lines). Each subject path is grouped by its FIRST dot-segment (the entity);
 * the remainder is the field name (which may itself contain dots, e.g.
 * "client.nyStatus"); a trailing "[]" marks a Collection field.
 *
 * Hardcoding the derived list (rather than parsing the .cs at runtime) keeps the
 * seeder robust and free of cross-language file coupling, while remaining an
 * exact, reviewable projection of the canonical vocabulary.
 *
 * A couple of fields carry `allowedValues` to exercise enum validation end to
 * end (specimen.type, patient.gender).
 */

import { FieldDataType } from '@prisma/client';

/** A seed field definition (relative name + type + optional metadata). */
export interface SeedField {
  name: string;
  dataType: FieldDataType;
  required?: boolean;
  allowedValues?: string[];
  description?: string;
}

/** A seed entity definition (key + its fields). */
export interface SeedEntity {
  key: string;
  description?: string;
  fields: SeedField[];
}

export const CANONICAL_ENTITIES: readonly SeedEntity[] = [
  {
    key: 'order',
    description: 'A test order placed against a patient.',
    fields: [
      { name: 'type', dataType: FieldDataType.String },
      { name: 'product', dataType: FieldDataType.String },
      { name: 'timepoint', dataType: FieldDataType.String },
      { name: 'client.nyStatus', dataType: FieldDataType.String },
      { name: 'performingLab', dataType: FieldDataType.String },
      { name: 'qualifyingInitialOrder', dataType: FieldDataType.String },
      { name: 'statContactInfo', dataType: FieldDataType.String },
      { name: 'dischargeDate', dataType: FieldDataType.Date },
      { name: 'tests[]', dataType: FieldDataType.Collection },
      { name: 'specimens[]', dataType: FieldDataType.Collection },
    ],
  },
  {
    key: 'test',
    description: 'An individual test within an order.',
    fields: [
      { name: 'code', dataType: FieldDataType.String },
      { name: 'specimen.type', dataType: FieldDataType.String },
      { name: 'specimen', dataType: FieldDataType.String },
      { name: 'orderedTest', dataType: FieldDataType.String },
      { name: 'priority', dataType: FieldDataType.String },
      { name: 'capGoverned', dataType: FieldDataType.Boolean },
    ],
  },
  {
    key: 'specimen',
    description: 'A physical specimen submitted for testing.',
    fields: [
      { name: 'age', dataType: FieldDataType.Number },
      {
        name: 'type',
        dataType: FieldDataType.String,
        allowedValues: [
          'FFPE',
          'FreshTissue',
          'BoneMarrow',
          'PeripheralBlood',
          'ParaffinTissue',
          'Blood',
          'Unknown',
        ],
      },
      { name: 'bodySite', dataType: FieldDataType.String },
      { name: 'archiveRetrievalDate', dataType: FieldDataType.Date },
      { name: 'fixationTime', dataType: FieldDataType.Number },
      { name: 'clientSpecimenId', dataType: FieldDataType.String },
      {
        name: 'origin',
        dataType: FieldDataType.String,
        allowedValues: [
          'HospitalInpatient',
          'HospitalOutpatient',
          'Clinic',
          'Reference',
          'Unknown',
        ],
      },
    ],
  },
  {
    key: 'patient',
    description: 'The patient associated with an order.',
    fields: [
      { name: 'age', dataType: FieldDataType.Number },
      {
        name: 'gender',
        dataType: FieldDataType.String,
        allowedValues: ['Male', 'Female', 'Other'],
      },
    ],
  },
  {
    key: 'document',
    description: 'A document accompanying an order or specimen.',
    fields: [
      { name: 'circledHE', dataType: FieldDataType.String },
      { name: 'cbc', dataType: FieldDataType.String },
      { name: 'pathologyReport', dataType: FieldDataType.String },
    ],
  },
  {
    key: 'incident',
    description: 'An operational incident raised against an order.',
    fields: [{ name: 'ageHours', dataType: FieldDataType.Number }],
  },
  {
    key: 'medicalReview',
    description: 'A human medical-review decision step.',
    fields: [{ name: 'decision', dataType: FieldDataType.String }],
  },
  {
    key: 'priorTimepoint',
    description: 'A prior timepoint in a longitudinal order.',
    fields: [{ name: 'status', dataType: FieldDataType.String }],
  },
];
