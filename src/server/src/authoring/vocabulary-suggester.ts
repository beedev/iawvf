/**
 * Deterministic vocabulary suggester.
 *
 * Given the author's natural-language text and the EXISTING registry properties, it
 * surfaces which of those properties are relevant — and nothing else. It NEVER invents a
 * new term: the only outputs are properties that already exist. When the text matches no
 * existing property, it returns an empty list and the caller says "unable to suggest".
 *
 * Matching is pure token overlap (no LLM, no network): the text is tokenised, and each
 * property is scored by how many text tokens hit its path segments, its (camelCase-split)
 * field name, or one of its allowed values. This keeps the behaviour predictable and the
 * "no silent invention" guarantee absolute.
 */

/** One existing registry property the suggester scores against the text. */
export interface SuggestableProperty {
  /** Canonical subject path, e.g. `specimen.bodySite`. */
  path: string;
  /** Data type name (e.g. `String`, `Number`) — passed through for display. */
  dataType: string;
  /** Closed value set, when the property is an enum (matched against the text too). */
  allowedValues?: readonly string[];
}

/** A relevant existing property, with the text tokens that matched it (for display). */
export interface VocabularySuggestion {
  /** The existing property path (always a real registry term — never invented). */
  path: string;
  /** Data type name, passed through. */
  dataType: string;
  /** The distinct text tokens that matched this property, sorted (the "why"). */
  matched: string[];
}

/** Generic English/structural words that carry no vocabulary signal. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'if', 'when', 'is', 'are', 'was', 'were', 'be',
  'to', 'of', 'for', 'in', 'on', 'no', 'not', 'has', 'have', 'had', 'with', 'as',
  'at', 'by', 'from', 'this', 'that', 'it', 'its', 'any', 'all', 'where', 'than',
  'then', 'into', 'must', 'should', 'their', 'there', 'been', 'they',
]);

/** Default minimum number of matched tokens for a property to be suggested. */
const DEFAULT_MIN_SCORE = 1;
/** Default cap on how many suggestions to return. */
const DEFAULT_LIMIT = 8;

/**
 * Suggests the EXISTING properties most relevant to {@link text}. Deterministic and
 * order-stable: results are sorted by descending match count, then by path. Returns `[]`
 * when nothing clears the threshold — the caller surfaces "unable to suggest".
 */
export function suggestRelevantProperties(
  text: string,
  properties: readonly SuggestableProperty[],
  options?: { minScore?: number; limit?: number },
): VocabularySuggestion[] {
  const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
  const limit = options?.limit ?? DEFAULT_LIMIT;

  const textTokens = tokenize(text).filter((t) => !STOPWORDS.has(t));
  if (textTokens.length === 0) {
    return [];
  }
  const textSet = new Set(textTokens);

  const scored: VocabularySuggestion[] = [];
  for (const property of properties) {
    const propertyTokens = propertyTokenSet(property);
    const matched = new Set<string>();
    for (const token of textSet) {
      if (tokenHits(token, propertyTokens)) {
        matched.add(token);
      }
    }
    if (matched.size >= minScore) {
      scored.push({
        path: property.path,
        dataType: property.dataType,
        matched: [...matched].sort((a, b) => a.localeCompare(b)),
      });
    }
  }

  scored.sort(
    (a, b) => b.matched.length - a.matched.length || a.path.localeCompare(b.path),
  );
  return scored.slice(0, limit);
}

/**
 * The lower-cased token set a property is matched on: its FIELD path segments (everything
 * after the leading `entity.`) plus every allowed value (camel/space split). The bare
 * entity name is deliberately EXCLUDED so that, say, "specimen" doesn't match every
 * `specimen.*` property — only field-level relevance counts. Trailing `[]` is stripped.
 */
function propertyTokenSet(property: SuggestableProperty): Set<string> {
  const tokens = new Set<string>();
  const clean = property.path.replace(/\[\]$/, '');
  const dot = clean.indexOf('.');
  const fieldPart = dot < 0 ? clean : clean.slice(dot + 1);
  for (const segment of fieldPart.split('.')) {
    for (const token of splitIdentifier(segment)) {
      tokens.add(token);
    }
  }
  for (const value of property.allowedValues ?? []) {
    for (const token of splitIdentifier(value)) {
      tokens.add(token);
    }
  }
  return tokens;
}

/**
 * True when a text token matches a property token. Exact match, or a containment match in
 * either direction for tokens of length ≥ 4 (so "pediatric" ↔ "paediatric" stay distinct
 * but "performinglab" ↔ "lab" connects), guarding against noisy short-substring hits.
 */
function tokenHits(textToken: string, propertyTokens: Set<string>): boolean {
  if (propertyTokens.has(textToken)) {
    return true;
  }
  if (textToken.length < 4) {
    return false;
  }
  for (const propertyToken of propertyTokens) {
    if (propertyToken.length < 4) {
      continue;
    }
    if (
      propertyToken.includes(textToken) ||
      textToken.includes(propertyToken)
    ) {
      return true;
    }
  }
  return false;
}

/** Tokenises free text into lower-case alphanumeric words of length ≥ 2. */
function tokenize(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/** Splits an identifier/value (camelCase, spaces, separators) into lower-case tokens ≥ 2. */
function splitIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}
