/**
 * The clock seam. Mirrors IClock / FixedClock from the .NET engine so tests can
 * pin a deterministic "now" (the corpus oracle uses 2026-06-17T12:00:00Z).
 */

/** A source of the current instant, as an ISO-8601 string. */
export interface Clock {
  now(): string;
}

/** A clock pinned to a fixed instant. */
export class FixedClock implements Clock {
  constructor(private readonly instant: string) {}
  now(): string {
    return this.instant;
  }
}

/** A clock backed by the system wall clock (UTC ISO-8601). */
export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
