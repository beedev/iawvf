/**
 * Reference-data provider over a JSON object document. A faithful port of
 * JsonReferenceDataProvider.cs: each top-level property is a reference key, the
 * literal (dotted) key is tried first (keys may legitimately contain dots, e.g.
 * `"TestCompendium.compatibleSpecimens"`), then a dotted path is walked through
 * nested objects (e.g. `"PolicyThresholds.fixationWindow"`). Resolved values are
 * cloned so callers cannot mutate the backing store.
 */

import { clone } from './facts';
import { JsonObject, JsonValue } from './types';

/** The contract a reference-data provider satisfies (mirrors IReferenceDataProvider). */
export interface ReferenceDataProvider {
  /** Resolves a key to its value, or `null` if not present. */
  resolve(key: string): JsonValue | null;
  /** Tries to resolve a key. Returns `{ found, value }` so callers can distinguish present-null. */
  tryResolve(key: string): { found: boolean; value: JsonValue | null };
}

function isPlainObject(node: JsonValue | undefined): node is JsonObject {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

function cloneNode(node: JsonValue | null | undefined): JsonValue | null {
  if (node === null || node === undefined) {
    return null;
  }
  if (typeof node === 'object') {
    // Deep clone arrays/objects so the store is never aliased into a fact write.
    return JSON.parse(JSON.stringify(node)) as JsonValue;
  }
  return node;
}

/** A {@link ReferenceDataProvider} loaded from a JSON object document. */
export class JsonReferenceDataProvider implements ReferenceDataProvider {
  private readonly root: JsonObject;

  constructor(root: JsonObject) {
    this.root = root;
  }

  /** Loads reference data from a JSON string. Mirrors FromJson. */
  static fromJson(json: string): JsonReferenceDataProvider {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('Reference data JSON must be an object.');
    }
    return new JsonReferenceDataProvider(parsed as JsonObject);
  }

  /** Loads reference data from an already-parsed object. */
  static fromObject(root: JsonObject): JsonReferenceDataProvider {
    return new JsonReferenceDataProvider(clone(root));
  }

  tryResolve(key: string): { found: boolean; value: JsonValue | null } {
    // Try the literal key first (keys may legitimately contain dots).
    if (Object.prototype.hasOwnProperty.call(this.root, key)) {
      return { found: true, value: cloneNode(this.root[key]) };
    }

    // Otherwise walk a dotted path through nested objects.
    let cursor: JsonValue | undefined = this.root;
    for (const segment of key.split('.')) {
      if (
        isPlainObject(cursor) &&
        Object.prototype.hasOwnProperty.call(cursor, segment)
      ) {
        cursor = cursor[segment];
      } else {
        return { found: false, value: null };
      }
    }

    return { found: true, value: cloneNode(cursor) };
  }

  resolve(key: string): JsonValue | null {
    const { found, value } = this.tryResolve(key);
    return found ? value : null;
  }
}
