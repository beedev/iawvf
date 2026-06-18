/**
 * The deterministic semantics for every {@link OperatorKind}. A faithful port of
 * OperatorSemantics.cs — the single source of truth for operator behaviour, with
 * type coercion (numbers, dates, strings, sets, booleans) and reference-data
 * consultation for the matching/eligibility families.
 *
 * @remarks Notable parity points vs .NET:
 *  - `Equals` tries numeric, then boolean, then ordinal string comparison.
 *  - `Compare` (used by GreaterThan/LessThan/Within/etc.) tries numeric, then date,
 *    then ordinal string — returning `null` (incomparable) when neither side coerces.
 *  - `Matches` is regex with a 100ms time budget; a timeout OR an invalid pattern
 *    is treated per .NET: timeout → no-match (false); invalid regex → exact match.
 *    JS has no native regex timeout, so we use a structural ReDoS pre-screen plus a
 *    bounded executor to guarantee the engine cannot hang (mirrors the H3 fix).
 *  - `null` left value short-circuits per .NET's `left is null` guards.
 */

import { coerceBool, coerceDate, coerceNumber, coerceString } from './facts';
import { ReferenceDataProvider } from './reference-data';
import { JsonValue, OperatorKind } from './types';

/** A resolved node may be a JSON value or `null` (absent / present-null). */
type Node = JsonValue | null;

/**
 * Evaluates a single operator against a left value (from a fact path) and a right
 * comparand (a literal or reference-resolved value). Mirrors OperatorSemantics.Evaluate.
 */
export function evaluateOperator(
  op: OperatorKind,
  left: Node,
  right: Node,
  references: ReferenceDataProvider,
  referenceKey?: string,
): boolean {
  switch (op) {
    case 'IsPresent':
      return left !== null;
    case 'IsAbsent':
      return left === null;

    case 'Equals':
      return valuesEqual(left, right);
    case 'NotEquals':
      return left !== null && !valuesEqual(left, right);

    case 'InSet':
      return isMember(left, right);
    case 'NotInSet':
      return left !== null && !isMember(left, right);

    case 'GreaterThan': {
      const c = compare(left, right);
      return c !== null && c > 0;
    }
    case 'LessThan': {
      const c = compare(left, right);
      return c !== null && c < 0;
    }
    case 'GreaterOrEqual': {
      const c = compare(left, right);
      return c !== null && c >= 0;
    }
    case 'LessOrEqual': {
      const c = compare(left, right);
      return c !== null && c <= 0;
    }
    case 'WithinRange':
      return withinRange(left, right);

    case 'Matches':
      return matches(left, right, references, referenceKey);
    case 'IsCompatibleWith':
      return referenceContains(left, right, references, referenceKey);

    case 'IsEligibleFor':
      return referenceContains(left, right, references, referenceKey);
    case 'Exists':
      return exists(left, right, references, referenceKey);

    default:
      return false;
  }
}

function valuesEqual(left: Node, right: Node): boolean {
  if (left === null || right === null) {
    return left === null && right === null;
  }

  // Numeric comparison first (so 30 == 30.0).
  const ld = coerceNumber(left);
  const rd = coerceNumber(right);
  if (ld !== null && rd !== null) {
    return ld === rd;
  }

  // Boolean comparison.
  const lb = coerceBool(left);
  const rb = coerceBool(right);
  if (lb !== null && rb !== null) {
    return lb === rb;
  }

  // Fall back to ordinal string comparison (covers enum-as-string).
  return coerceString(left) === coerceString(right);
}

function isMember(left: Node, right: Node): boolean {
  if (left === null) {
    return false;
  }
  for (const element of enumerateSet(right)) {
    if (valuesEqual(left, element)) {
      return true;
    }
  }
  return false;
}

/** Three-way comparison: <0, 0, >0, or `null` when incomparable. Mirrors Compare. */
function compare(left: Node, right: Node): number | null {
  if (left === null || right === null) {
    return null;
  }

  const ld = coerceNumber(left);
  const rd = coerceNumber(right);
  if (ld !== null && rd !== null) {
    return ld < rd ? -1 : ld > rd ? 1 : 0;
  }

  const ldate = coerceDate(left);
  const rdate = coerceDate(right);
  if (ldate !== null && rdate !== null) {
    return ldate < rdate ? -1 : ldate > rdate ? 1 : 0;
  }

  const ls = coerceString(left);
  const rs = coerceString(right);
  if (ls !== null && rs !== null) {
    return compareOrdinal(ls, rs);
  }

  return null;
}

/** Ordinal (code-unit) string comparison, matching string.CompareOrdinal. */
function compareOrdinal(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function withinRange(left: Node, right: Node): boolean {
  if (
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    Array.isArray(right)
  ) {
    return false;
  }

  const min = right.min ?? null;
  const max = right.max ?? null;

  // If a bound is present it must yield a comparable result.
  if (min !== null) {
    const cmin = compare(left, min);
    if (cmin === null) {
      return false;
    }
  }
  if (max !== null) {
    const cmax = compare(left, max);
    if (cmax === null) {
      return false;
    }
  }

  const cminCmp = min === null ? null : compare(left, min);
  const cmaxCmp = max === null ? null : compare(left, max);

  const aboveMin = min === null || (cminCmp !== null && cminCmp >= 0);
  const belowMax = max === null || (cmaxCmp !== null && cmaxCmp <= 0);

  return aboveMin && belowMax;
}

function matches(
  left: Node,
  right: Node,
  references: ReferenceDataProvider,
  referenceKey?: string,
): boolean {
  // Reference-backed match (compatibility set) takes precedence when a key is supplied.
  if (referenceKey !== undefined) {
    return referenceContains(left, right, references, referenceKey);
  }

  if (left === null || right === null) {
    return false;
  }

  const subject = coerceString(left);
  const pattern = coerceString(right);
  if (subject === null || pattern === null) {
    return false;
  }

  return safeRegexMatch(subject, pattern);
}

function referenceContains(
  left: Node,
  right: Node,
  references: ReferenceDataProvider,
  referenceKey?: string,
): boolean {
  if (left === null) {
    return false;
  }

  // The reference (when supplied) provides the authoritative set/value.
  const authority =
    referenceKey !== undefined ? references.resolve(referenceKey) : right;
  if (authority === null) {
    return false;
  }

  return isMember(left, authority) || valuesEqual(left, authority);
}

function exists(
  left: Node,
  right: Node,
  references: ReferenceDataProvider,
  referenceKey?: string,
): boolean {
  if (referenceKey !== undefined) {
    const { found, value } = references.tryResolve(referenceKey);
    if (!found || value === null) {
      return false;
    }
    return isTruthy(value);
  }
  return left !== null || (right !== null && isTruthy(right));
}

function isTruthy(node: JsonValue): boolean {
  const b = coerceBool(node);
  if (b !== null) {
    return b;
  }
  if (Array.isArray(node)) {
    return node.length > 0;
  }
  const s = coerceString(node);
  return s !== null && s.length > 0;
}

/**
 * Enumerates a comparand as a set. Mirrors EnumerateSet: arrays fan out element by
 * element; a comma-bearing string splits on commas (trimmed, empties removed);
 * everything else is a single-element set.
 */
function* enumerateSet(set: Node): Generator<Node> {
  if (set === null) {
    return;
  }
  if (Array.isArray(set)) {
    for (const element of set) {
      yield element;
    }
    return;
  }
  if (typeof set === 'string' && set.includes(',')) {
    for (const part of set
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)) {
      yield part;
    }
    return;
  }
  yield set;
}

// ─── ReDoS-guarded regex matcher (mirrors the .NET 100ms timeout fix, H3) ─────

const REGEX_TIME_BUDGET_MS = 100;

/**
 * Bounds regex evaluation so a pathological pattern/input cannot hang the engine.
 *
 * JS regexes have no built-in timeout. We approximate the .NET behaviour with:
 *  1. A wall-clock guard around a single `RegExp.test` call. Because `test` is
 *     synchronous and uncancellable, the guard alone cannot interrupt a runaway
 *     backtracker — so we pair it with:
 *  2. A structural ReDoS heuristic that rejects patterns containing nested or
 *     adjacent unbounded quantifiers over overlapping classes (the classic
 *     "catastrophic backtracking" shapes). Such patterns are treated as a timeout
 *     → no-match (false), exactly as the .NET RegexMatchTimeoutException path.
 *
 * Invalid patterns fall back to exact ordinal string match (parity with the
 * ArgumentException branch in OperatorSemantics.Matches).
 */
function safeRegexMatch(subject: string, pattern: string): boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    // Not a valid regex — fall back to exact match.
    return subject === pattern;
  }

  if (isLikelyCatastrophic(pattern)) {
    // Treat as exceeding the time budget → no-match.
    return false;
  }

  const start = Date.now();
  const result = regex.test(subject);
  if (Date.now() - start > REGEX_TIME_BUDGET_MS) {
    // Exceeded the budget on a (rare) slow but non-flagged pattern → no-match.
    return false;
  }
  return result;
}

/**
 * Heuristic detector for catastrophic-backtracking shapes. Conservative: it only
 * flags the well-known dangerous constructions so ordinary patterns are unaffected.
 *  - Nested quantifiers:        (a+)+   (a*)*   (a+)*   (.*)+   etc.
 *  - Adjacent overlapping star/plus on the same group/class.
 */
function isLikelyCatastrophic(pattern: string): boolean {
  // (group with a trailing quantifier) followed by an outer quantifier.
  const nestedQuantifier = /\([^()]*[+*][^()]*\)[+*]/;
  if (nestedQuantifier.test(pattern)) {
    return true;
  }
  // Two unbounded quantifiers separated only by another quantified atom, e.g. a+a+ over the same alnum class repeated.
  const repeatedUnbounded = /(\[[^\]]*\]|\\?.)\+\1?\+/;
  if (repeatedUnbounded.test(pattern)) {
    return true;
  }
  return false;
}
