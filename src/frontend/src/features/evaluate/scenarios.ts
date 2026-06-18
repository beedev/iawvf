/**
 * A curated library of named example transactions for the Evaluate playground.
 *
 * Each scenario is hand-crafted to produce a CLEAN, UNAMBIGUOUS result against the live rule set:
 * a `fails` scenario trips EXACTLY ONE business outcome (Validation / Workflow / Entity / Control)
 * with no incidental holds and no "Suppressed" noise; a `passes` scenario produces zero business
 * outcomes; a `derives` scenario stamps exactly one derived value and raises no holds.
 *
 * Isolation technique: every scenario carries the fields that would otherwise wake OTHER rules —
 * e.g. `patient.gender` so BL27 never fires its gender-default Suppressed; `specimen.clientSpecimenId`
 * on FFPE specimens (PM19) unless PM19 is the subject; a `test.code` that is NOT in any membership set
 * we don't intend (PM17/PM27/PM28); `specimen.age` under the archive threshold (PM48); and so on.
 *
 * Every `factsJson` here was verified against POST /api/evaluate on the live Node API and confirmed to
 * yield only the intended business/derivation outcome (everything else returns Continue / no-action).
 * The trigger defaults to OrderEvent; PM49_DECISION uses DecisionReturned.
 *
 * Source of truth for the rules: /rules/*.json. Outcome→group mapping: server vdf/types.ts `groupFor`.
 */

import type { TriggerType } from '../../lib/types/api';

/** Which shelf of the library a scenario belongs to, for grouped presentation. */
export type ScenarioCategory = 'passes' | 'fails' | 'derives';

/** A single named example transaction. */
export interface Scenario {
  /** Stable identifier (also the keying value in the picker). */
  id: string;
  /** Short, human-facing name shown in the menu. */
  name: string;
  /** One-line plain-language description of what the transaction represents. */
  description: string;
  /** Human label for the expected result, e.g. "Complete Hold (PM17)". */
  expected: string;
  /** Which shelf this scenario lives on. */
  category: ScenarioCategory;
  /** The rule key this scenario is built to demonstrate (for the report / tooltip). */
  rule: string;
  /** Optional non-default trigger (PM49_DECISION needs DecisionReturned). */
  triggerType?: TriggerType;
  /** The facts document loaded into the editor. */
  factsJson: Record<string, unknown>;
}

/**
 * The verified library. Order within each category is intentional (most representative first).
 */
export const SCENARIOS: Scenario[] = [
  // ── PASSES ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'pass-ffpe',
    name: 'Well-formed FFPE order',
    description:
      'A complete FFPE immunohistochemistry order: client-supplied specimen ID present, specimen within the archive-age window, fixation in range. Nothing to hold.',
    expected: 'Passes — order proceeds',
    category: 'passes',
    rule: '—',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FFPE' }],
      },
      test: { code: 'IHC-P-001', specimen: { type: 'FFPE' } },
      specimen: {
        type: 'FFPE',
        age: 10,
        fixationTime: 24,
        clientSpecimenId: 'CS-1001',
        bodySite: 'Lung',
        origin: 'Clinic',
      },
      patient: { age: 54, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'pass-radar',
    name: 'Valid RaDaR first timepoint',
    description:
      'A RaDaR first-timepoint order with BOTH required specimen types received — paraffin tissue and peripheral blood — so no placeholder records are needed.',
    expected: 'Passes — order proceeds',
    category: 'passes',
    rule: '—',
    factsJson: {
      order: {
        type: 'Initial',
        product: 'RaDaR',
        timepoint: 'First',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'ParaffinTissue' }, { type: 'PeripheralBlood' }],
      },
      test: { code: 'NGS-P-001' },
      specimen: { type: 'ParaffinTissue', age: 12, bodySite: 'Lung' },
      patient: { age: 60, gender: 'Male' },
      document: {},
    },
  },

  // ── FAILS (one business outcome each) ───────────────────────────────────────────────────────────
  {
    id: 'fail-pm17',
    name: 'Technical FISH on FFPE, no circled H&E',
    description:
      'A Technical FISH test (FISH-T-001) on an FFPE specimen with no circled H&E slide on the document. The order is held complete until the slide is provided.',
    expected: 'Complete Hold (PM17)',
    category: 'fails',
    rule: 'PM17',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FFPE' }],
      },
      test: { code: 'FISH-T-001', specimen: { type: 'FFPE' } },
      specimen: { type: 'FreshTissue', age: 5, bodySite: 'Lung', clientSpecimenId: 'CS-001' },
      patient: { age: 45, gender: 'Male' },
      document: {},
    },
  },
  {
    id: 'fail-pm19',
    name: 'FFPE specimen, no client specimen ID',
    description:
      'An FFPE specimen submitted without the client specimen identifier. FFPE specimens must carry the client ID, so the order is held complete.',
    expected: 'Complete Hold (PM19)',
    category: 'fails',
    rule: 'PM19',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FFPE' }],
      },
      test: { code: 'IHC-P-001', specimen: { type: 'FFPE' } },
      specimen: { type: 'FFPE', age: 10, fixationTime: 24, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'fail-pm48',
    name: 'Aged specimen, no archive retrieval date',
    description:
      'A specimen older than the 30-day archive threshold with no archive retrieval date recorded. The test is held partial until the retrieval date is captured.',
    expected: 'Partial Hold (PM48)',
    category: 'fails',
    rule: 'PM48',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FFPE' }],
      },
      test: { code: 'IHC-P-001', specimen: { type: 'FFPE' } },
      specimen: {
        type: 'FFPE',
        age: 45,
        fixationTime: 24,
        clientSpecimenId: 'CS-2001',
        bodySite: 'Lung',
        origin: 'Clinic',
      },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'fail-pm18',
    name: 'STAT order, no escalation contact',
    description:
      'A STAT-priority test with no escalation contact recorded on the order. STAT work requires a contact, so the test is held partial.',
    expected: 'Partial Hold (PM18)',
    category: 'fails',
    rule: 'PM18',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'IHC-P-001', priority: 'STAT' },
      specimen: { type: 'FreshTissue', age: 5, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'fail-pm49',
    name: 'CAP-governed test, fixation out of window',
    description:
      'A CAP-governed test whose specimen fixation time (100h) is outside the acceptable 6–72h window. The test is routed to medical review before any testing proceeds.',
    expected: 'Route to Review (PM49)',
    category: 'fails',
    rule: 'PM49',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'IHC-P-001', capGoverned: true },
      specimen: { type: 'FreshTissue', age: 5, fixationTime: 100, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'fail-bl38',
    name: 'RaDaR first timepoint, specimens missing',
    description:
      'A RaDaR first-timepoint order missing both required specimen types (paraffin tissue and peripheral blood). A placeholder peripheral-blood record is created for the awaited specimen.',
    expected: 'Create Placeholder (BL38)',
    category: 'fails',
    rule: 'BL38_MULTI',
    factsJson: {
      order: {
        type: 'Initial',
        product: 'RaDaR',
        timepoint: 'First',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'NGS-P-001' },
      specimen: { type: 'FreshTissue', age: 12, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 60, gender: 'Male' },
      document: {},
    },
  },
  {
    id: 'fail-bl46',
    name: 'Follow-up order with no initial order',
    description:
      'A follow-up order submitted with no qualifying initial order on file for the patient. Submission is blocked until a qualifying initial order exists.',
    expected: 'Prevent Action (BL46)',
    category: 'fails',
    rule: 'BL46',
    factsJson: {
      order: {
        type: 'FollowUp',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'IHC-P-001' },
      specimen: { type: 'FreshTissue', age: 5, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'fail-bl8',
    name: 'NY-regulated client, non-NY-validated lab',
    description:
      'An order from a New York–regulated client routed to a performing lab that is not on the NY-validated lab list. A compliance alert is raised on the order.',
    expected: 'Compliance Alert (BL8)',
    category: 'fails',
    rule: 'BL8',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'NYRegulated' },
        performingLab: 'Lab-CA-9',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'IHC-P-001' },
      specimen: { type: 'FreshTissue', age: 5, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
  {
    id: 'fail-pm49dec',
    name: 'Medical review returned a rejection',
    description:
      'A returned medical-review decision of "Reject" arrives for the test (a DecisionReturned trigger). The order is held complete on the strength of the rejection.',
    expected: 'Complete Hold (PM49_DECISION)',
    category: 'fails',
    rule: 'PM49_DECISION',
    triggerType: 'DecisionReturned',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'IHC-P-001' },
      specimen: { type: 'FreshTissue', age: 5, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      medicalReview: { decision: 'Reject' },
      document: {},
    },
  },

  // ── DERIVES ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'derive-bl3',
    name: 'Pediatric patient → Pediatric priority',
    description:
      'A 12-year-old patient (under the pediatric age of 19). The engine derives test.priority = "Pediatric". No holds — see Facts after run for the stamped value.',
    expected: 'Derives test.priority = Pediatric (BL3)',
    category: 'derives',
    rule: 'BL3',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'FreshTissue' }],
      },
      test: { code: 'IHC-P-001' },
      specimen: { type: 'FreshTissue', age: 5, bodySite: 'Lung', origin: 'Clinic' },
      patient: { age: 12, gender: 'Male' },
      document: {},
    },
  },
  {
    id: 'derive-bl21',
    name: 'Peripheral blood → body site',
    description:
      'A peripheral-blood specimen with no body site recorded. The engine defaults specimen.bodySite = "PeripheralBlood". No holds — see Facts after run for the stamped value.',
    expected: 'Derives specimen.bodySite = PeripheralBlood (BL21)',
    category: 'derives',
    rule: 'BL21',
    factsJson: {
      order: {
        type: 'Initial',
        client: { nyStatus: 'Standard' },
        performingLab: 'Lab-NY-1',
        specimens: [{ type: 'PeripheralBlood' }],
      },
      test: { code: 'IHC-P-001' },
      specimen: { type: 'PeripheralBlood', age: 2, origin: 'Clinic' },
      patient: { age: 50, gender: 'Female' },
      document: {},
    },
  },
];

/** The human-facing label for each shelf, used by the picker's option groups. */
export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  passes: 'Passes',
  fails: 'Fails',
  derives: 'Derivations',
};

/** Stable shelf order for grouped presentation. */
export const CATEGORY_ORDER: ScenarioCategory[] = ['passes', 'fails', 'derives'];

/** Group the library by category, preserving {@link CATEGORY_ORDER} and per-category order. */
export function scenariosByCategory(): Array<{ category: ScenarioCategory; items: Scenario[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: SCENARIOS.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
}

/** Look up a scenario by id. */
export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
