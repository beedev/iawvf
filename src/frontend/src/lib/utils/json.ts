/** Stable pretty-print used everywhere we render rule / facts JSON. */
export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Parse, returning either the value or a human-readable error (never throws). */
export function tryParseJson<T = unknown>(
  text: string,
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON.';
    return { ok: false, error: message };
  }
}
