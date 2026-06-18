/**
 * Derives the OBJECT(S) and PROPERTIES a rule operates on, purely from its structured definition —
 * mirroring the authoring "Scope" selection so the repository detail reads "here's the object(s),
 * here's the rule." No backend call: we walk the rule's `appliesWhen` and `assert` condition trees,
 * collect each leaf `subject`, strip a trailing `[]` (collection quantifier), and group the paths by
 * their first '.'-segment → objects with their referenced property paths.
 *
 * Source shape (see /rules/*.json): a condition node is either
 *   { type: 'leaf',  subject: string, operator: string, ... }
 * or
 *   { type: 'group', logicalOp: string, conditions: ConditionNode[] }.
 * The outcome blocks (`onFailure` / `onSuccess`, or a bare `scope`) carry an outcome scope
 * (order | test | specimen) which we surface as additional context.
 */

import type { RuleJson, RuleScopeDefinition } from './types/api';

/** One object the rule touches, with the distinct property names referenced beneath it. */
export interface RuleScopeObject {
  /** First path segment, e.g. `specimen` (lower-case identifier). */
  name: string;
  /** Display label, e.g. `Specimen`. */
  label: string;
  /** Property names relative to the object, e.g. `age`, `archiveRetrievalDate`, `client.nyStatus`. */
  properties: string[];
}

/** The derived scope of a rule. */
export interface RuleScope {
  objects: RuleScopeObject[];
  /** Outcome scope context from `onFailure`/`onSuccess` (e.g. `order`, `test`, `specimen`). */
  outcomeScope?: string;
}

/** Title-case a single-word object identifier for display (e.g. `specimen` → `Specimen`). */
function toLabel(name: string): string {
  if (name.length === 0) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Recursively gather every leaf `subject` string under a condition node. Groups recurse into their
 * `conditions`; leaves contribute their `subject`. Unknown / malformed nodes are skipped safely.
 */
function collectSubjects(node: unknown, acc: string[]): void {
  if (!isRecord(node)) return;

  const subject = node.subject;
  if (typeof subject === 'string' && subject.length > 0) {
    acc.push(subject);
  }

  const conditions = node.conditions;
  if (Array.isArray(conditions)) {
    for (const child of conditions) collectSubjects(child, acc);
  }
}

/** Read an outcome `scope` from an outcome block, if present and a non-empty string. */
function readOutcomeScope(block: unknown): string | undefined {
  if (!isRecord(block)) return undefined;
  const scope = block.scope;
  return typeof scope === 'string' && scope.length > 0 ? scope : undefined;
}

/**
 * Extract the {@link RuleScope} for a structured rule. Subjects are split on the FIRST '.' into an
 * object name and a property path; a trailing `[]` collection marker is stripped from the subject
 * before splitting. Object and property ordering follows first appearance; duplicates are removed.
 */
export function extractRuleScope(rule: RuleJson | null | undefined): RuleScope {
  if (!isRecord(rule)) return { objects: [] };

  const subjects: string[] = [];
  collectSubjects(rule.appliesWhen, subjects);
  collectSubjects(rule.assert, subjects);

  // Preserve insertion order while de-duplicating object names and their properties.
  const order: string[] = [];
  const byName = new Map<string, { label: string; properties: string[] }>();

  for (const raw of subjects) {
    // Strip every collection quantifier `[]` so `order.specimens[].type` → `order.specimens.type`.
    const path = raw.replace(/\[\]/g, '');
    const dot = path.indexOf('.');
    // A subject with no '.' is an object-level reference with no specific property.
    const name = dot === -1 ? path : path.slice(0, dot);
    const property = dot === -1 ? null : path.slice(dot + 1);
    if (name.length === 0) continue;

    let entry = byName.get(name);
    if (!entry) {
      entry = { label: toLabel(name), properties: [] };
      byName.set(name, entry);
      order.push(name);
    }
    if (property && !entry.properties.includes(property)) {
      entry.properties.push(property);
    }
  }

  const objects: RuleScopeObject[] = order.map((name) => {
    const entry = byName.get(name)!;
    return { name, label: entry.label, properties: entry.properties };
  });

  const outcomeScope = readOutcomeScope(rule.onFailure) ?? readOutcomeScope(rule.onSuccess);

  return outcomeScope ? { objects, outcomeScope } : { objects };
}

/**
 * Read the AUTHORED scope an author attached via the Scope selector (persisted under the rule's
 * optional `scope` key), mapping it into the same {@link RuleScope} shape used for derived scope so
 * both render through one component. Object names are humanized with {@link toLabel} (consistent
 * with the derived-scope vocabulary); each authored property PATH is shown relative to its object.
 *
 * Returns `null` when the rule carries no authored scope (no `scope`, or one with neither objects
 * nor properties) — callers then fall back to {@link extractRuleScope}.
 */
export function readAuthoredScope(rule: RuleJson | null | undefined): RuleScope | null {
  if (!isRecord(rule)) return null;

  const scope = rule.scope as RuleScopeDefinition | undefined;
  if (!isRecord(scope)) return null;

  const objectNames = Array.isArray(scope.objects) ? scope.objects.filter(isNonEmptyString) : [];
  const propertyPaths = Array.isArray(scope.properties)
    ? scope.properties.filter(isNonEmptyString)
    : [];
  if (objectNames.length === 0 && propertyPaths.length === 0) return null;

  // Preserve insertion order, de-duplicating object names and their object-relative properties.
  const order: string[] = [];
  const byName = new Map<string, { label: string; properties: string[] }>();

  const ensure = (name: string): { label: string; properties: string[] } => {
    let entry = byName.get(name);
    if (!entry) {
      entry = { label: toLabel(name), properties: [] };
      byName.set(name, entry);
      order.push(name);
    }
    return entry;
  };

  for (const name of objectNames) ensure(name);

  for (const path of propertyPaths) {
    const dot = path.indexOf('.');
    const name = dot === -1 ? path : path.slice(0, dot);
    const property = dot === -1 ? null : path.slice(dot + 1);
    const entry = ensure(name);
    if (property && !entry.properties.includes(property)) entry.properties.push(property);
  }

  const objects: RuleScopeObject[] = order.map((name) => {
    const entry = byName.get(name)!;
    return { name, label: entry.label, properties: entry.properties };
  });

  return { objects };
}
