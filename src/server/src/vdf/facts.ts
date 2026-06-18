/**
 * The fact substrate for rule evaluation. A faithful TypeScript port of
 * FactDocument.cs: dotted-path resolution with collection fan-out (`a.b[].c`)
 * and indexed access (`a.b[0].c`), a setter for derived-fact write-back, and the
 * number/date/string/bool coercion helpers used by operator semantics.
 *
 * @remarks Semantic parity notes vs .NET (System.Text.Json):
 *  - JSON numbers parse to a single JS `number`. .NET distinguishes decimal/long/
 *    double but its coercion collapses them to a comparable decimal, so behaviour
 *    matches for the corpus (integer thresholds, ages, fixation times). We use
 *    `number` throughout; equality and ordering are exact for the integer and
 *    small-decimal values the corpus uses.
 *  - Dates: `coerceDate` uses `Date.parse` (ISO-8601), matching DateTimeOffset.
 *    TryParse for the ISO strings in fixtures. Returns epoch ms for comparison.
 */

import { JsonObject, JsonValue } from './types';

/** A coercion result for dates: epoch milliseconds, or null when not a date. */
type EpochMs = number;

/** Parsed segment of a dotted path. */
interface Segment {
  name: string;
  fanOut: boolean;
  index: number | null;
}

function parseSegment(segment: string): Segment {
  const open = segment.indexOf('[');
  if (open < 0 || !segment.endsWith(']')) {
    return { name: segment, fanOut: false, index: null };
  }

  const name = segment.slice(0, open);
  const inner = segment.slice(open + 1, segment.length - 1);

  if (inner.length === 0) {
    return { name, fanOut: true, index: null };
  }

  // C# uses int.TryParse(NumberStyles.Integer); accept a plain integer only.
  if (/^[+-]?\d+$/.test(inner)) {
    return { name, fanOut: false, index: Number.parseInt(inner, 10) };
  }

  return { name, fanOut: false, index: null };
}

function isPlainObject(node: JsonValue | undefined): node is JsonObject {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/**
 * Resolves a dotted path to all matching nodes. Mirrors FactDocument.ResolveAll:
 * a `[]` segment fans out across the array; a `[i]` segment selects an index; a
 * plain segment reads a property. A missing segment yields no nodes.
 *
 * @returns The matching nodes (possibly empty). `undefined` slots represent
 *  JSON `null` values resolved at a path (preserving the present-but-null case);
 *  callers treat `null` as "absent" identically to .NET's `JsonNode? = null`.
 */
export function resolveAll(
  root: JsonObject,
  path: string,
): (JsonValue | undefined)[] {
  if (!path || path.trim().length === 0) {
    return [];
  }

  let current: (JsonValue | undefined)[] = [root];

  for (const rawSegment of path.split('.')) {
    const next: (JsonValue | undefined)[] = [];
    const { name, fanOut, index } = parseSegment(rawSegment);

    for (const node of current) {
      if (!isPlainObject(node) || !(name in node)) {
        continue;
      }

      const child = node[name];

      if (fanOut) {
        if (Array.isArray(child)) {
          for (const element of child) {
            next.push(element);
          }
        }
      } else if (index !== null) {
        if (Array.isArray(child) && index >= 0 && index < child.length) {
          next.push(child[index]);
        }
      } else {
        next.push(child);
      }
    }

    current = next;
  }

  return current;
}

/**
 * Resolves a dotted path to a single node (the first match), or `null` if absent.
 * Mirrors FactDocument.Resolve. A present-but-JSON-null value resolves to `null`
 * (indistinguishable from absent — matching .NET, where JSON null becomes C# null).
 */
export function resolve(root: JsonObject, path: string): JsonValue | null {
  const all = resolveAll(root, path);
  if (all.length === 0) {
    return null;
  }
  const first = all[0];
  return first === undefined || first === null ? null : first;
}

/**
 * Writes a value at the supplied dotted path, creating intermediate objects as
 * needed. Mirrors FactDocument.Set — the mechanism behind derivation write-back
 * and apply-default recovery (rule chaining). Collection fan-out is not supported
 * for writes.
 */
export function setPath(
  root: JsonObject,
  path: string,
  value: JsonValue,
): void {
  if (!path || path.trim().length === 0) {
    throw new Error('Path must be provided.');
  }

  const segments = path.split('.');
  let cursor: JsonObject = root;

  for (let s = 0; s < segments.length - 1; s++) {
    const name = segments[s];
    const existing = cursor[name];
    if (isPlainObject(existing)) {
      cursor = existing;
    } else {
      const created: JsonObject = {};
      cursor[name] = created;
      cursor = created;
    }
  }

  cursor[segments[segments.length - 1]] = value;
}

/** Produces an independent deep copy (structuredClone fallback to JSON round-trip). */
export function clone(root: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(root)) as JsonObject;
}

// ─── Coercion helpers (mirror FactDocument.Coerce*) ───────────────────────────

/**
 * Coerces a node to a string. Mirrors FactDocument.CoerceString: strings pass
 * through; booleans render `"true"`/`"false"`; numbers render invariantly;
 * objects/arrays render as JSON. Returns `null` for absent.
 */
export function coerceString(
  node: JsonValue | null | undefined,
): string | null {
  if (node === null || node === undefined) {
    return null;
  }

  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'boolean') {
    return node ? 'true' : 'false';
  }
  if (typeof node === 'number') {
    // Invariant numeric rendering. Integers render without a decimal point,
    // matching decimal.ToString(InvariantCulture) for the corpus' integer values.
    return numberToInvariantString(node);
  }

  // Object or array → JSON string (matches JsonNode.ToJsonString shape closely
  // enough for tracing; never used for equality in the corpus).
  return JSON.stringify(node);
}

function numberToInvariantString(n: number): string {
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toString();
}

/**
 * Coerces a node to a number. Mirrors FactDocument.CoerceDecimal: accepts numeric
 * values and numeric strings (invariant). Returns `null` otherwise.
 */
export function coerceNumber(
  node: JsonValue | null | undefined,
): number | null {
  if (typeof node === 'number') {
    return Number.isFinite(node) ? node : null;
  }
  if (typeof node === 'string') {
    // decimal.TryParse(NumberStyles.Any) — accept leading/trailing whitespace and sign.
    const trimmed = node.trim();
    if (trimmed.length === 0) {
      return null;
    }
    // Reject values Number() would coerce loosely (e.g. "" → 0, "0x1" → 1).
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Coerces a node to epoch milliseconds. Mirrors FactDocument.CoerceDateTimeOffset:
 * accepts ISO-8601 date strings. A bare date/time without an offset is assumed UTC
 * (DateTimeStyles.AssumeUniversal). Returns `null` otherwise.
 */
export function coerceDate(node: JsonValue | null | undefined): EpochMs | null {
  if (typeof node !== 'string') {
    return null;
  }
  const trimmed = node.trim();
  // Require a date-shaped string so plain words ("FollowUp") never parse as dates.
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(trimmed)) {
    return null;
  }
  // If no timezone designator is present, assume UTC (AssumeUniversal parity).
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed);
  const normalized =
    hasZone || (!trimmed.includes('T') && !trimmed.includes(' '))
      ? trimmed.includes('T') || trimmed.includes(' ')
        ? trimmed
        : `${trimmed}T00:00:00Z`
      : `${trimmed}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Coerces a node to a boolean. Mirrors FactDocument.CoerceBool: accepts boolean
 * values and the strings `"true"`/`"false"` (case-insensitive, matching bool.TryParse).
 * Returns `null` otherwise.
 */
export function coerceBool(node: JsonValue | null | undefined): boolean | null {
  if (typeof node === 'boolean') {
    return node;
  }
  if (typeof node === 'string') {
    const lower = node.trim().toLowerCase();
    if (lower === 'true') {
      return true;
    }
    if (lower === 'false') {
      return false;
    }
  }
  return null;
}
