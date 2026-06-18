import type { SubjectDataType, VdfRole } from '../types/api';

/**
 * Pure, framework-free helpers for the Vocabulary admin surface: role gating, path validation, and
 * object-name derivation. Kept side-effect-free so the gating + payload logic is unit-testable without
 * rendering or network. The path rules mirror the backend `VocabularyPathConventions` exactly.
 *
 * Source of truth: src/backend/IAW.Vdf.Abstractions/Vocabulary/VocabularyPathConventions.cs
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

/** The closed set of subject data types, ordered for the Add-property select. */
export const SUBJECT_DATA_TYPES: readonly SubjectDataType[] = [
  'String',
  'Number',
  'Date',
  'Boolean',
  'Collection',
] as const;

/**
 * Canonical subject-path pattern: one or more dotted segments of `[A-Za-z][A-Za-z0-9]*` with an OPTIONAL
 * trailing `[]` on the final segment (collections). Mirrors the backend regex so the client rejects the
 * same shapes the API would 400 on, before a round-trip.
 */
const PATH_REGEX = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*(\[\])?$/;

/** True when a path is well-formed per the canonical subject pattern. */
export function isValidSubjectPath(path: string | null | undefined): boolean {
  if (path === null || path === undefined) return false;
  const trimmed = path.trim();
  return trimmed.length > 0 && PATH_REGEX.test(trimmed);
}

/**
 * The owning object name for a subject path: the first dotted segment with any trailing `[]` stripped
 * (e.g. `"order.client.program"` → `"order"`, `"order.tests[]"` → `"order"`). Returns `''` for empty
 * input. Does not validate; pair with {@link isValidSubjectPath}.
 */
export function deriveObjectName(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return '';
  const firstSegment = trimmed.split('.', 1)[0];
  return firstSegment.endsWith('[]') ? firstSegment.slice(0, -2) : firstSegment;
}
