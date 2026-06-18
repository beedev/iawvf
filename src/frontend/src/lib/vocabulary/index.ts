import type { FieldDataType, VdfRole } from '../types/api';

/**
 * Pure, framework-free helpers for the entity-registry admin surface: role gating, entity-key and
 * field-name validation, and label derivation. Kept side-effect-free so the gating + payload logic is
 * unit-testable without rendering or network. The patterns mirror the server registry constants
 * EXACTLY so the client rejects the same shapes the API would 400 on, before a round-trip.
 *
 * Source of truth: src/server/src/registry/registry.constants.ts + registry.naming.ts
 */

/** The Admin role required to view and administer the controlled vocabulary. */
export const VOCABULARY_ADMIN_ROLE: VdfRole = 'Admin';

/**
 * Whether a set of roles may see the Vocabulary nav item and reach the route. Vocabulary administration
 * is Admin-only; an Author/Reviewer is hidden from it (and the API would 403 them regardless).
 */
export function canAdminVocabulary(roles: readonly VdfRole[] | null | undefined): boolean {
  return roles?.includes(VOCABULARY_ADMIN_ROLE) ?? false;
}

/** The closed set of field data types, ordered for the Add-field select. */
export const FIELD_DATA_TYPES: readonly FieldDataType[] = [
  'String',
  'Number',
  'Date',
  'Boolean',
  'Collection',
] as const;

/**
 * An entity key is a SINGLE identifier segment: a letter followed by letters/digits. Stored canonical
 * lower-case; matched case-insensitively by the server (so "Kit" then "kit" is a 409). Mirrors
 * ENTITY_KEY_PATTERN.
 */
const ENTITY_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9]*$/;

/**
 * A field name is one or more dotted identifier segments with an OPTIONAL trailing `[]` (collection):
 * e.g. `fixationTime`, `client.nyStatus`, `tests[]`. Mirrors FIELD_NAME_PATTERN.
 */
const FIELD_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*(\[\])?$/;

/** True when an entity key is well-formed per the canonical single-segment pattern. */
export function isValidEntityKey(key: string | null | undefined): boolean {
  if (key === null || key === undefined) return false;
  const trimmed = key.trim();
  return trimmed.length > 0 && ENTITY_KEY_REGEX.test(trimmed);
}

/** True when a field name is well-formed per the canonical dotted-segment pattern. */
export function isValidFieldName(name: string | null | undefined): boolean {
  if (name === null || name === undefined) return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && FIELD_NAME_REGEX.test(trimmed);
}

/**
 * Humanizes an identifier key for display when no explicit label is given, mirroring the server's
 * `humanizeLabel`: split camelCase, capitalize the first word (e.g. `medicalReview` → `Medical
 * review`, `kit` → `Kit`). Used only for the read-only preview; the server derives the stored label.
 */
export function humanizeLabel(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) return '';
  const spaced = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Composes the read-only `entity.field` path shown to the author for clarity when adding a field.
 * Returns `''` when either part is empty.
 */
export function composeFieldPath(entityKey: string, fieldName: string): string {
  const key = entityKey.trim();
  const name = fieldName.trim();
  if (key.length === 0 || name.length === 0) return '';
  return `${key}.${name}`;
}
