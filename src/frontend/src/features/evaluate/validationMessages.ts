import type { ValidationError } from '../../lib/types/api';

/**
 * Turn a raw registry message ("must be string", "must be number", "must be equal to one of the
 * allowed values") into a plain-language sentence a non-engineer can act on, naming the expected
 * type in human terms. Falls back to the raw message for anything we don't recognize.
 *
 * Kept framework-free (no React) so it can be reused by the banner and unit-tested in isolation.
 */
export function humanizeValidationError(err: ValidationError): string {
  const m = err.message.toLowerCase();
  if (m.includes('must be string')) return `${err.path} should be text (String).`;
  if (m.includes('must be number')) return `${err.path} should be a number (Number).`;
  if (m.includes('must be boolean')) return `${err.path} should be true/false (Boolean).`;
  if (m.includes('must be') && m.includes('date')) return `${err.path} should be a date (Date).`;
  if (m.includes('allowed values'))
    return `${err.path} is not one of the values the registry allows.`;
  return `${err.path}: ${err.message}`;
}
