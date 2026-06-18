import type { InterpretRequest, VocabularyObject } from '../../lib/types/api';
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
