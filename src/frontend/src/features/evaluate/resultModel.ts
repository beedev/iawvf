/**
 * Pure presentation logic for the Evaluate result region — the layer that turns the API's raw
 * `outcomes` (an internals dump) into an intuitive, human-readable verdict.
 *
 * Nothing in here touches React or Fluent; it is deliberately framework-free so the verdict logic,
 * the group-label mapping, and the no-action partitioning can be unit-tested in isolation.
 *
 * Source of truth for the group enum: server `vdf/types.ts` `groupFor` —
 *   None        → Continue / Suppressed            (no action; de-emphasized)
 *   Validation  → CompleteHold / PartialHold / Warning / ComplianceAlert
 *   Workflow    → RouteToReview / RouteToQueue / Escalate
 *   Derivation  → SetValue / ApplyDefault / CalculateValue
 *   Entity      → CreatePlaceholder / CreateIncident / CreateTask
 *   Control     → PreventAction / AllowAction
 */

import type { Outcome } from '../../lib/types/api';

/** The internal API group enum, as returned on every outcome. */
export type OutcomeGroup =
  | 'None'
  | 'Validation'
  | 'Workflow'
  | 'Derivation'
  | 'Entity'
  | 'Control';

/**
 * The groups that represent a real, user-facing business decision. An evaluation "passes" precisely
 * when NONE of these are produced. `Derivation` is intentionally excluded — derived values are not
 * holds or alerts; they are surfaced separately (and the order still proceeds).
 */
export const BUSINESS_GROUPS: ReadonlySet<OutcomeGroup> = new Set<OutcomeGroup>([
  'Validation',
  'Workflow',
  'Entity',
  'Control',
]);

/**
 * Friendlier headings for each internal group enum. These replace the raw enum names in the UI so a
 * non-engineer can read the result: "Holds & alerts" rather than "Validation", etc.
 */
export const GROUP_LABELS: Record<OutcomeGroup, string> = {
  Validation: 'Holds & alerts',
  Workflow: 'Routing',
  Entity: 'Records created',
  Control: 'Blocked actions',
  Derivation: 'Derived values',
  None: 'No action',
};

/** A short, plain-language gloss shown under each group heading. */
export const GROUP_HINTS: Record<OutcomeGroup, string> = {
  Validation: 'The order is held or flagged until something is corrected.',
  Workflow: 'The work is routed somewhere — e.g. medical review or a queue.',
  Entity: 'A new record is created — e.g. a placeholder for an awaited specimen.',
  Control: 'An action the user attempted is blocked.',
  Derivation: 'A value the engine computed and stamped onto the facts.',
  None: 'Rules that ran but produced no action for these facts.',
};

/** Map an outcome group string (possibly unknown) to a friendly label, defensively. */
export function groupLabel(group: string): string {
  return GROUP_LABELS[group as OutcomeGroup] ?? group;
}

/** Map an outcome group string to its plain-language hint, defensively. */
export function groupHint(group: string): string {
  return GROUP_HINTS[group as OutcomeGroup] ?? '';
}

/** True when an outcome represents a real business decision (a hold, route, record, or block). */
export function isBusinessOutcome(o: Outcome): boolean {
  return BUSINESS_GROUPS.has(o.group as OutcomeGroup);
}

/** True when an outcome is a no-action result (Continue / Suppressed → group None). */
export function isNoActionOutcome(o: Outcome): boolean {
  return (o.group as OutcomeGroup) === 'None';
}

/** True when an outcome is a derived value. */
export function isDerivationOutcome(o: Outcome): boolean {
  return (o.group as OutcomeGroup) === 'Derivation';
}

/** The top-line verdict severity. `held` is shown red/amber; `passes` is green. */
export type Verdict = 'passes' | 'held';

/**
 * A headline line for the verdict banner — one per business outcome, condensed to the essentials
 * (type + scope + reason) so the user reads WHAT happened without scrolling into the detail cards.
 */
export interface VerdictHeadline {
  type: string;
  group: string;
  scope: string | null;
  reason: string | null;
}

/** The computed top-line verdict for an evaluation. */
export interface VerdictSummary {
  verdict: Verdict;
  /** Count of business outcomes (holds / alerts / routes / records / blocks). */
  businessCount: number;
  /** Count of no-action outcomes (Continue / Suppressed) — de-emphasized. */
  noActionCount: number;
  /** Count of derived values stamped onto the facts. */
  derivationCount: number;
  /** The condensed headlines for each business outcome (empty when it passes). */
  headlines: VerdictHeadline[];
}

/**
 * Compute the top-line verdict from an evaluation's outcomes.
 *
 * Rule: an evaluation PASSES when there are zero business outcomes (Validation / Workflow / Entity /
 * Control). Any business outcome flips it to HELD, and each becomes a headline. Derivations and
 * no-action outcomes never change the verdict — they are counted separately.
 */
export function computeVerdict(outcomes: Outcome[]): VerdictSummary {
  const business = outcomes.filter(isBusinessOutcome);
  const noAction = outcomes.filter(isNoActionOutcome);
  const derivations = outcomes.filter(isDerivationOutcome);

  return {
    verdict: business.length === 0 ? 'passes' : 'held',
    businessCount: business.length,
    noActionCount: noAction.length,
    derivationCount: derivations.length,
    headlines: business.map((o) => ({
      type: o.type,
      group: o.group,
      scope: o.scope,
      reason: o.reason,
    })),
  };
}

/** A group of outcomes for the detail region, keyed by friendly label and carrying its accent. */
export interface OutcomeGroupView {
  group: string;
  label: string;
  hint: string;
  items: Outcome[];
}

/**
 * Partition outcomes into the ordered groups shown in the detail region — business + derivation
 * groups only (no-action outcomes are handled separately by {@link partitionNoAction}). Order is
 * deterministic: holds, routing, records, blocked, then derived values.
 */
const DETAIL_GROUP_ORDER: OutcomeGroup[] = [
  'Validation',
  'Workflow',
  'Entity',
  'Control',
  'Derivation',
];

export function groupOutcomesForDetail(outcomes: Outcome[]): OutcomeGroupView[] {
  return DETAIL_GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    hint: GROUP_HINTS[group],
    items: outcomes.filter((o) => (o.group as OutcomeGroup) === group),
  })).filter((g) => g.items.length > 0);
}

/** Split the no-action outcomes (Continue / Suppressed) out so the UI can collapse them by default. */
export function partitionNoAction(outcomes: Outcome[]): Outcome[] {
  return outcomes.filter(isNoActionOutcome);
}
