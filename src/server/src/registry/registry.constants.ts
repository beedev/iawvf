/**
 * Registry domain constants: the closed data-type vocabulary and the validation
 * patterns governing entity keys and field names. Centralised so the service,
 * DTOs, and schema compiler share one source of truth.
 */

import { FieldDataType } from '@prisma/client';

/** The five legal field data types (mirrors the .NET SubjectDataType enum). */
export const FIELD_DATA_TYPES: readonly FieldDataType[] = [
  FieldDataType.String,
  FieldDataType.Number,
  FieldDataType.Date,
  FieldDataType.Boolean,
  FieldDataType.Collection,
] as const;

/**
 * An entity key is a single identifier segment: starts with a letter, followed
 * by letters/digits. Stored canonical lower-case; matched case-insensitively.
 */
export const ENTITY_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

/**
 * A field name is one or more dot-separated identifier segments, optionally
 * ending in "[]" to denote a collection (e.g. "fixationTime", "client.nyStatus",
 * "tests[]"). No leading/trailing dots, no empty segments.
 */
export const FIELD_NAME_PATTERN =
  /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*(\[\])?$/;
