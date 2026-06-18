/**
 * Pure naming helpers for the registry: canonicalising keys (case-insensitive
 * uniqueness) and deriving human-readable labels from camelCase identifiers.
 *
 * Kept side-effect-free and dependency-free so they are trivially unit-testable
 * and reusable by the seeder, service, and DTO layers.
 */

/**
 * Canonical form of an entity key used for storage and uniqueness checks:
 * lower-cased and trimmed. This is THE mechanism that makes "Kit" and "kit"
 * collide — both canonicalise to "kit".
 */
export function canonicalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Derives a human-readable label from a camelCase identifier.
 * "medicalReview" -> "Medical Review", "order" -> "Order",
 * "priorTimepoint" -> "Prior Timepoint".
 */
export function humanizeLabel(identifier: string): string {
  const spaced = identifier
    // insert a space before each interior upper-case letter
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // split acronym runs followed by a word ("HEStain" -> "HE Stain")
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();

  return spaced
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
