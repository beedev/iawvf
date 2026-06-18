/**
 * The deterministic rule engine. A faithful port of VdfEngine.cs: select →
 * evaluate (AppliesWhen / Assert / OnSuccess / OnFailure) → recover → derive
 * (write-back for rule chaining) → dispatch → return outcomes + traces + facts.
 *
 * @remarks Determinism: the same request evaluated twice produces identical
 * outcomes and (modulo the fixed clock) identical traces. The working fact
 * document is cloned from the request so the caller's facts are never mutated; all
 * derivations are written into that clone and returned as `factsAfter`.
 */

import { Clock, SystemClock } from './clock';
import { ConditionTraceSink, evaluateCondition } from './conditions';
import { clone, resolve, setPath } from './facts';
import { ReferenceDataProvider } from './reference-data';
import { selectRules } from './selector';
import {
  Condition,
  DecisionTrace,
  EvaluationResult,
  groupFor,
  JsonObject,
  JsonValue,
  Outcome,
  RecoveryStrategy,
  RecoveryStrategyName,
  RuleDefinition,
} from './types';

/** A handler invoked for each produced outcome it can handle. Mirrors IOutcomeHandler. */
export interface OutcomeHandler {
  canHandle(type: Outcome['type']): boolean;
  handle(outcome: Outcome, facts: JsonObject): void;
}

/** A request to evaluate. Mirrors EvaluationRequest (the bits the engine reads). */
export interface EvaluationRequest {
  /** The fact substrate (plain JSON object). Never mutated. */
  facts: JsonObject;
  /** The instant for windowing + trace timestamps (ISO-8601). */
  asOf: string;
  /** Optional rule-set filter; only rules with a matching (or absent) ruleSet run. */
  ruleSet?: string;
}

/** The deterministic VDF rule engine. */
export class VdfEngine {
  private readonly rules: RuleDefinition[];
  private readonly references: ReferenceDataProvider;
  private readonly clock: Clock;
  private readonly handlers: OutcomeHandler[];

  constructor(
    rules: RuleDefinition[],
    references: ReferenceDataProvider,
    clock: Clock = new SystemClock(),
    handlers: OutcomeHandler[] = [],
  ) {
    this.rules = rules;
    this.references = references;
    this.clock = clock;
    this.handlers = handlers;
  }

  /** Evaluates the request, returning outcomes, full traces, and derived facts. */
  evaluate(request: EvaluationRequest): EvaluationResult {
    // 1. Work on an isolated copy so the caller's facts are never mutated.
    const facts = clone(request.facts);

    // 2. Select applicable rules deterministically (optionally partitioned by rule set).
    const candidates =
      request.ruleSet === undefined
        ? this.rules
        : this.rules.filter(
            (r) => r.ruleSet === undefined || r.ruleSet === request.ruleSet,
          );
    const ordered = selectRules(candidates, request.asOf);

    const outcomes: Outcome[] = [];
    const traces: DecisionTrace[] = [];

    // 3. Evaluate each rule in phase/priority/key order. Derivations write back into
    //    `facts` so later-phase rules observe them (rule chaining).
    for (const rule of ordered) {
      const { trace, produced } = this.evaluateRule(rule, facts);
      traces.push(trace);
      if (produced !== null) {
        outcomes.push(produced);
      }
    }

    // 4. Dispatch outcomes to matching handlers.
    for (const outcome of outcomes) {
      for (const handler of this.handlers) {
        if (handler.canHandle(outcome.type)) {
          handler.handle(outcome, facts);
        }
      }
    }

    return { outcomes, trace: traces, factsAfter: facts };
  }

  private evaluateRule(
    rule: RuleDefinition,
    facts: JsonObject,
  ): { trace: DecisionTrace; produced: Outcome | null } {
    const sink: ConditionTraceSink = [];
    const evaluatedAt = this.clock.now();

    // WHEN: applicability gate. Absent AppliesWhen means "always applies".
    const applies =
      rule.appliesWhen === undefined ||
      this.evaluate1(rule.appliesWhen, facts, sink);
    if (!applies) {
      return {
        trace: this.buildTrace(
          rule,
          sink,
          evaluatedAt,
          false,
          null,
          false,
          false,
          null,
        ),
        produced: null,
      };
    }

    // DECISION: an absent Assert is treated as failing through to OnFailure
    // (derivation rules rely on this).
    const assertResult =
      rule.assert !== undefined && this.evaluate1(rule.assert, facts, sink);

    if (assertResult) {
      const success = rule.onSuccess;
      this.applyDerivationIfAny(success, facts);
      return {
        trace: this.buildTrace(
          rule,
          sink,
          evaluatedAt,
          true,
          true,
          false,
          false,
          success,
        ),
        produced: success,
      };
    }

    // Assertion failed (or absent): attempt recovery before producing OnFailure.
    let recoveryAttempted = false;

    if (rule.recover !== undefined) {
      recoveryAttempted = true;
      const recoveryResolved = this.tryRecover(rule.recover, facts);
      if (recoveryResolved) {
        // Recovery satisfied the intent; suppress OnFailure unless the author
        // explicitly defined Suppressed.
        const suppressed: Outcome =
          rule.onFailure.type === 'Suppressed'
            ? rule.onFailure
            : {
                type: 'Suppressed',
                reason: rule.onFailure.reason ?? 'Resolved by recovery',
                parameters: {},
              };
        return {
          trace: this.buildTrace(
            rule,
            sink,
            evaluatedAt,
            true,
            false,
            true,
            true,
            suppressed,
          ),
          produced: suppressed,
        };
      }
    }

    // No recovery, or recovery did not resolve: produce OnFailure (may be a derivation).
    const failure = rule.onFailure;
    this.applyDerivationIfAny(failure, facts);
    return {
      trace: this.buildTrace(
        rule,
        sink,
        evaluatedAt,
        true,
        false,
        recoveryAttempted,
        false,
        failure,
      ),
      produced: failure,
    };
  }

  private evaluate1(
    condition: Condition,
    facts: JsonObject,
    sink: ConditionTraceSink,
  ): boolean {
    return evaluateCondition(condition, facts, this.references, sink);
  }

  /** Writes a derivation outcome's target fact back into the working document (rule chaining). */
  private applyDerivationIfAny(outcome: Outcome, facts: JsonObject): void {
    if (groupFor(outcome.type) !== 'Derivation') {
      return;
    }
    const target = outcome.parameters['Target'];
    if (typeof target === 'string') {
      const value = outcome.parameters['Value'] ?? null;
      setPath(facts, target, value);
    }
  }

  /** Attempts a recovery strategy. Returns true if it resolved the failure. Mirrors TryRecover. */
  private tryRecover(recovery: RecoveryStrategy, facts: JsonObject): boolean {
    switch (recovery.strategy) {
      case RecoveryStrategyName.ApplyDefault: {
        const target = recovery.parameters['Target'];
        if (typeof target !== 'string') {
          return false;
        }

        let value: JsonValue | null = null;
        const refKey = recovery.parameters['Reference'];
        if (typeof refKey === 'string') {
          value = this.references.resolve(refKey);
        }
        if (value === null && 'Value' in recovery.parameters) {
          const literal = recovery.parameters['Value'];
          value = literal === undefined ? null : literal;
        }
        if (value === null) {
          return false;
        }

        setPath(facts, target, value);
        return true;
      }

      case RecoveryStrategyName.FindAlternateSpecimen:
        // Stub: host-specific search is not implemented; treated as unresolved so
        // OnFailure fires (parity with the .NET M0 stub).
        return false;

      default:
        return false;
    }
  }

  private buildTrace(
    rule: RuleDefinition,
    sink: ConditionTraceSink,
    evaluatedAt: string,
    applied: boolean,
    assertResult: boolean | null,
    recoveryAttempted: boolean,
    recoveryResolved: boolean,
    produced: Outcome | null,
  ): DecisionTrace {
    const factsRead: Record<string, string | null> = {};
    for (const c of sink) {
      factsRead[c.subject] = c.resolvedLeft;
    }

    return {
      ruleKey: rule.key,
      version: rule.version,
      phase: rule.phase,
      applied,
      assertResult: applied ? assertResult : null,
      conditions: sink.slice(),
      recoveryAttempted,
      recoveryResolved,
      produced,
      factsRead,
      evaluatedAt,
    };
  }
}

/** Resolves a fact path on a plain object (re-export for handler convenience). */
export { resolve as resolveFact };
