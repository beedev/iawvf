/**
 * Deterministic JSON tokenizer shared by {@link JsonView}. Splitting it out of the component file
 * keeps fast-refresh happy (component files should export only components) and makes the pure
 * tokenizer trivially unit-testable.
 */

export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain';

export interface JsonToken {
  type: JsonTokenType;
  value: string;
}

const TOKEN_REGEX =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],:])/g;

/** Tokenize a pretty-printed JSON string into typed spans. */
export function tokenizeJson(input: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'plain', value: input.slice(lastIndex, match.index) });
    }
    const [whole, key, str, num, bool, nul, punct] = match;
    if (key !== undefined) tokens.push({ type: 'key', value: whole });
    else if (str !== undefined) tokens.push({ type: 'string', value: whole });
    else if (num !== undefined) tokens.push({ type: 'number', value: whole });
    else if (bool !== undefined) tokens.push({ type: 'boolean', value: whole });
    else if (nul !== undefined) tokens.push({ type: 'null', value: whole });
    else if (punct !== undefined) tokens.push({ type: 'punct', value: whole });
    lastIndex = match.index + whole.length;
  }
  if (lastIndex < input.length) {
    tokens.push({ type: 'plain', value: input.slice(lastIndex) });
  }
  return tokens;
}
