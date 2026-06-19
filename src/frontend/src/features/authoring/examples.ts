/**
 * Curated example prompts shown as chips on the NL input. Authoring is scoped to
 * VALIDATION rules for now (hold / flag / require) — derive and route are deferred (see
 * docs/ARCHITECTURE.md §10), so their examples are intentionally not listed here.
 */
export const EXAMPLE_PROMPTS: string[] = [
  'Hold the order if Technical FISH on FFPE has no circled H&E.',
  'Flag the specimen when fixation time exceeds 48 hours.',
  'Hold pediatric orders where the patient age is under 2 years.',
];
