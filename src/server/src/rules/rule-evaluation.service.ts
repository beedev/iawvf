import { Injectable } from '@nestjs/common';
import { SystemClock } from '../vdf/clock';
import { EvaluationRequest, VdfEngine } from '../vdf/engine';
import { EvaluationResult, JsonObject } from '../vdf/types';
import { DbReferenceDataLoader } from './db-reference-data.provider';
import { RuleRepository } from './rule.repository';

/** Options for a DB-backed evaluation. */
export interface EvaluateOptions {
  /** The instant for effective-date windowing + trace timestamps. Defaults to now. */
  asOf?: Date;
  /** Optional rule-set filter. */
  ruleSet?: string;
}

/**
 * An {@link EvaluationResult} paired with a `ruleKey -> name` lookup over the rules that actually
 * ran. The map is built from the SAME active-rule set the engine evaluated, so the API layer can
 * attribute each outcome/trace entry to a human-readable rule name WITHOUT touching engine internals
 * or issuing a second query. Keep this DB-shaped projection out of the pure engine.
 */
export interface EvaluationWithRules {
  result: EvaluationResult;
  /** Maps a rule key (e.g. `PM17`) to its human-readable name. */
  ruleNamesByKey: Map<string, string>;
}

/**
 * Wires the N2 deterministic engine to the Postgres-backed seams: it loads the
 * active rules ({@link RuleRepository.getActiveRulesAsync}) and the DB reference data
 * ({@link DbReferenceDataLoader.load}) for the requested instant, constructs a
 * {@link VdfEngine}, and evaluates a fact document.
 *
 * This is the engine-over-DB path the N6 `/evaluate` endpoint will call. It proves
 * the engine produces identical outcomes whether grounded on the on-disk corpus or
 * the Postgres-backed repository + reference store.
 */
@Injectable()
export class RuleEvaluationService {
  constructor(
    private readonly ruleRepo: RuleRepository,
    private readonly referenceLoader: DbReferenceDataLoader,
  ) {}

  /**
   * Evaluates {@link facts} against the active rules at {@link EvaluateOptions.asOf}
   * (default: now), returning outcomes, full traces, and derived facts.
   */
  async evaluate(
    facts: JsonObject,
    options: EvaluateOptions = {},
  ): Promise<EvaluationResult> {
    const asOf = options.asOf ?? new Date();
    const [rules, references] = await Promise.all([
      this.ruleRepo.getActiveRulesAsync(asOf, options.ruleSet),
      this.referenceLoader.load(),
    ]);

    const engine = new VdfEngine(rules, references, new SystemClock());
    const request: EvaluationRequest = {
      facts,
      asOf: asOf.toISOString(),
      ...(options.ruleSet !== undefined ? { ruleSet: options.ruleSet } : {}),
    };
    return engine.evaluate(request);
  }

  /**
   * Same as {@link evaluate}, but also returns a `ruleKey -> name` map over the rules that ran, so
   * the API layer can attribute outcomes/traces to readable rule names. The map is derived from the
   * exact rule set the engine evaluated — no engine change, no extra query.
   */
  async evaluateWithRules(
    facts: JsonObject,
    options: EvaluateOptions = {},
  ): Promise<EvaluationWithRules> {
    const asOf = options.asOf ?? new Date();
    const [rules, references] = await Promise.all([
      this.ruleRepo.getActiveRulesAsync(asOf, options.ruleSet),
      this.referenceLoader.load(),
    ]);

    const engine = new VdfEngine(rules, references, new SystemClock());
    const request: EvaluationRequest = {
      facts,
      asOf: asOf.toISOString(),
      ...(options.ruleSet !== undefined ? { ruleSet: options.ruleSet } : {}),
    };
    const result = engine.evaluate(request);

    const ruleNamesByKey = new Map<string, string>();
    for (const rule of rules) {
      ruleNamesByKey.set(rule.key, rule.name);
    }

    return { result, ruleNamesByKey };
  }
}
