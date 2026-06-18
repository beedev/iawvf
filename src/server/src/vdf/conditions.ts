/**
 * Condition-tree evaluation. Ports LeafCondition.Evaluate and
 * GroupCondition.Evaluate: leaves apply an operator to a subject (scalar via the
 * `This` quantifier, or fanned-out via `Any`/`Every`), and groups combine children
 * with All (AND) / Any (OR) / Not. Groups evaluate ALL children (no short-circuit)
 * so the recorded trace is complete for explainability, matching the .NET engine.
 */

import { coerceString, resolve, resolveAll } from './facts';
import { evaluateOperator } from './operators';
import { ReferenceDataProvider } from './reference-data';
import {
  Condition,
  ConditionTrace,
  GroupCondition,
  JsonObject,
  JsonValue,
  LeafCondition,
  Quantifier,
} from './types';

/** A mutable sink collecting one {@link ConditionTrace} per leaf comparison. */
export type ConditionTraceSink = ConditionTrace[];

/** Evaluates any condition, appending leaf traces to {@link sink}. */
export function evaluateCondition(
  condition: Condition,
  facts: JsonObject,
  references: ReferenceDataProvider,
  sink: ConditionTraceSink,
): boolean {
  if (condition.type === 'leaf') {
    return evaluateLeaf(condition, facts, references, sink);
  }
  return evaluateGroup(condition, facts, references, sink);
}

function resolveComparand(
  leaf: LeafCondition,
  references: ReferenceDataProvider,
): JsonValue | null {
  if (leaf.reference !== undefined) {
    return references.resolve(leaf.reference);
  }
  return leaf.value === undefined ? null : leaf.value;
}

function evaluateLeaf(
  leaf: LeafCondition,
  facts: JsonObject,
  references: ReferenceDataProvider,
  sink: ConditionTraceSink,
): boolean {
  const right = resolveComparand(leaf, references);
  const quantifier: Quantifier = leaf.quantifier ?? 'This';

  let result: boolean;
  let leftRendering: string | null;

  if (quantifier === 'This') {
    const left = resolve(facts, leaf.subject);
    leftRendering = coerceString(left);
    result = evaluateOperator(
      leaf.operator,
      left,
      right,
      references,
      leaf.reference,
    );
  } else {
    const elements = resolveAll(facts, leaf.subject).map((e) =>
      e === undefined ? null : e,
    );
    leftRendering = `[${elements.length} element(s)]`;

    if (quantifier === 'Any') {
      result = elements.some((e) =>
        evaluateOperator(leaf.operator, e, right, references, leaf.reference),
      );
    } else {
      // Every: non-empty and all satisfy.
      result =
        elements.length > 0 &&
        elements.every((e) =>
          evaluateOperator(leaf.operator, e, right, references, leaf.reference),
        );
    }
  }

  const resolvedRight =
    leaf.reference !== undefined
      ? `ref:${leaf.reference}=${coerceString(right) ?? ''}`
      : coerceString(right);

  sink.push({
    subject: leaf.subject,
    operator: leaf.operator,
    quantifier,
    resolvedLeft: leftRendering,
    resolvedRight,
    result,
  });

  return result;
}

function evaluateGroup(
  group: GroupCondition,
  facts: JsonObject,
  references: ReferenceDataProvider,
  sink: ConditionTraceSink,
): boolean {
  switch (group.logicalOp) {
    case 'All': {
      // Evaluate all children (no short-circuit) for a complete trace.
      const results = group.conditions.map((c) =>
        evaluateCondition(c, facts, references, sink),
      );
      return results.every((r) => r);
    }
    case 'Any': {
      const results = group.conditions.map((c) =>
        evaluateCondition(c, facts, references, sink),
      );
      return results.some((r) => r);
    }
    case 'Not': {
      if (group.conditions.length !== 1) {
        throw new Error(
          "A 'Not' group must contain exactly one child condition.",
        );
      }
      return !evaluateCondition(group.conditions[0], facts, references, sink);
    }
    default:
      return false;
  }
}
