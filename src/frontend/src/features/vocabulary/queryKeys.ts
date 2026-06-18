/** The TanStack Query cache key for the admin vocabulary listing. Centralized so every mutation that
 * mutates the catalog invalidates the exact same key. */
export const VOCABULARY_QUERY_KEY = ['vocabulary', 'admin'] as const;
