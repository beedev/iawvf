import type {
  InterpretRequest,
  RuleJson,
  RuleScopeDefinition,
  VocabularyObject,
} from '../../lib/types/api';
import type { ScopeChipItem } from '../../components';

/**
 * The author's chosen interpret scope. `objects` holds selected object names; `properties` holds the
 * full property PATHS the author optionally narrowed to (a subset belonging to the selected objects).
 * An empty selection on both means "full vocabulary" (unscoped).
 */
export interface ScopeSelection {
  objects: string[];
  properties: string[];
}

export const EMPTY_SCOPE: ScopeSelection = { objects: [], properties: [] };

/** True when the author has made no scope choice (interpret runs against the full vocabulary). */
export function isUnscoped(selection: ScopeSelection): boolean {
  return selection.objects.length === 0 && selection.properties.length === 0;
}

/**
 * Build the scope fields for the interpret request from a selection:
 * - any properties selected  → send `properties` (full paths), the narrowest constraint;
 * - else any objects selected → send `objects` (object names);
 * - else neither (full vocabulary).
 * Exported (and pure) so it can be unit-tested independently of React.
 */
export function buildInterpretScope(
  selection: ScopeSelection,
): Pick<InterpretRequest, 'objects' | 'properties'> {
  if (selection.properties.length > 0) return { properties: selection.properties };
  if (selection.objects.length > 0) return { objects: selection.objects };
  return {};
}

/**
 * Attach the author's chosen scope to a rule body just before saving, returning a NEW rule object
 * (the input is never mutated). The Scope selector is the source of truth for a rule's scope, so:
 *
 *   1. If the rule JSON ALREADY contains a `scope` key (the author typed one by hand in the Edit
 *      tab), we RESPECT it and leave the body untouched — explicit hand-editing wins.
 *   2. Otherwise, if the selection is NON-EMPTY, we inject
 *      `scope = { objects: [...selectedObjectNames], properties: [...selectedPropertyPaths] }`.
 *   3. Otherwise (unscoped selection, no typed scope) we OMIT `scope` entirely — never send an
 *      empty `{ objects: [], properties: [] }`.
 *
 * Every other field of the rule is preserved verbatim. Pure & React-free for unit testing.
 */
export function buildSaveRuleJson(rule: RuleJson, selection: ScopeSelection): RuleJson {
  // (1) Respect a scope the author typed into the Edit tab — explicit hand-editing is authoritative.
  if (Object.prototype.hasOwnProperty.call(rule, 'scope')) {
    return { ...rule };
  }

  // (3) Unscoped selection → omit `scope` rather than sending an empty object.
  if (isUnscoped(selection)) {
    return { ...rule };
  }

  // (2) Inject the selection as the authored scope, preserving the rest of the rule untouched.
  const scope: RuleScopeDefinition = {
    objects: [...selection.objects],
    properties: [...selection.properties],
  };
  return { ...rule, scope };
}

/**
 * Derive the display chips for the active selection. Each selected object becomes a chip; if specific
 * properties were chosen for it, they are listed (by their object-relative name) on the chip.
 */
export function selectionToChips(
  selection: ScopeSelection,
  vocabulary: VocabularyObject[],
): ScopeChipItem[] {
  return selection.objects.map((name) => {
    const obj = vocabulary.find((o) => o.name === name);
    const label = obj?.label ?? name;
    const propNames = (obj?.properties ?? [])
      .filter((p) => selection.properties.includes(p.path))
      .map((p) => p.name);
    return { name, label, properties: propNames };
  });
}
