/**
 * The TanStack Query cache key for the entity-registry listing. Centralized so every mutation that
 * mutates the registry invalidates the exact same key.
 */
export const REGISTRY_QUERY_KEY = ['registry', 'entities'] as const;
