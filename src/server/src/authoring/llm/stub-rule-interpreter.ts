/**
 * A deterministic, fully OFFLINE {@link IRuleInterpreter}.
 *
 * A port of {@link ../../../../backend/IAW.Vdf.Authoring.Llm/Interpretation/StubRuleInterpreter.cs}.
 * It maps a handful of known natural-language phrasings to known corpus rules via
 * simple keyword matching, returning high confidence for a match and a clear gap for
 * anything it does not recognise. It performs NO network I/O and always returns the
 * same result for the same input, making it ideal for the automated test suite and
 * as a safe fallback when the live OpenAI interpreter is unavailable (disabled / no
 * key / network error).
 */

import {
  GroundingVocabulary,
  IRuleInterpreter,
  InterpretationResult,
  summarizeGrounding,
  TermProposal,
} from './interpreter';

import { RuleDefinition } from '../../vdf/types';

/** The interpreter version string, recorded for provenance. */
export const STUB_INTERPRETER_VERSION = 'stub-rule-interpreter/1.0.0';

/** A pseudo-model id recorded in provenance for offline (no real model) runs. */
const OFFLINE_MODEL = 'offline-stub';

export class StubRuleInterpreter implements IRuleInterpreter {
  interpret(
    naturalLanguage: string,
    grounding: GroundingVocabulary,
  ): Promise<InterpretationResult> {
    // The stub is grounding-agnostic (it maps known phrasings to corpus rules), but
    // the parameter is part of the IRuleInterpreter contract.
    void grounding;
    const text = (naturalLanguage ?? '').toLowerCase();

    const matched = match(text);
    if (matched !== null) {
      return Promise.resolve(
        success(matched.rule, matched.confidence, naturalLanguage),
      );
    }

    // An obviously-unknown concept the stub cannot map but CAN name a term for, so
    // offline tests deterministically exercise the missing-vocabulary proposal path.
    const proposed = proposeUnknownTerm(text, naturalLanguage);
    if (proposed !== null) {
      return Promise.resolve(proposed);
    }

    return Promise.resolve(unrecognized(naturalLanguage));
  }
}

/** A known unknown-concept phrasing → the structured term the UI should offer to add. */
interface UnknownConcept {
  match: string[];
  proposal: Omit<TermProposal, 'phrase'>;
}

const UNKNOWN_CONCEPTS: UnknownConcept[] = [
  {
    match: ['colour', 'color'],
    proposal: {
      entity: 'specimen',
      field: 'colour',
      path: 'specimen.colour',
      dataType: 'String',
      entityExists: true,
      rationale:
        'The rule refers to specimen colour, which is not yet a registry field on specimen.',
    },
  },
  {
    match: ['fixation'],
    proposal: {
      entity: 'specimen',
      field: 'fixative',
      path: 'specimen.fixative',
      dataType: 'String',
      entityExists: true,
      rationale:
        'The rule refers to a fixation concept that is not yet a registry field on specimen.',
    },
  },
];

/**
 * Returns an {@link InterpretationResult} carrying a structured {@link TermProposal}
 * (candidate suppressed) when the input references a known unknown concept; otherwise
 * `null`. Lets the offline suite assert the missing-vocabulary path deterministically.
 */
function proposeUnknownTerm(
  text: string,
  naturalLanguage: string,
): InterpretationResult | null {
  const concept = UNKNOWN_CONCEPTS.find((c) => contains(text, ...c.match));
  if (concept === undefined) {
    return null;
  }
  const trimmed = (naturalLanguage ?? '').trim();
  const proposal: TermProposal = {
    ...concept.proposal,
    phrase: trimmed === '' ? undefined : trimmed,
  };
  return {
    candidate: null,
    confidence: 0,
    grounding: summarizeGrounding(null, trimmed === '' ? [] : [trimmed]),
    unmappedPhrases: trimmed === '' ? [] : [trimmed],
    gaps: [
      `The phrase references '${proposal.path}', which is not in the controlled vocabulary. ` +
        'Add the proposed term to the registry, then re-interpret.',
    ],
    termProposals: [proposal],
    naturalLanguage,
    interpreterVersion: STUB_INTERPRETER_VERSION,
    model: OFFLINE_MODEL,
  };
}

interface Match {
  rule: RuleDefinition;
  confidence: number;
}

function match(text: string): Match | null {
  // PM17 — circled H&E required for Technical FISH on FFPE.
  if (
    (contains(text, 'circled') && contains(text, 'fish')) ||
    (contains(text, 'h&e') && contains(text, 'fish'))
  ) {
    return { rule: buildPm17(), confidence: 0.95 };
  }

  // BL46 — follow-up order requires a qualifying initial order.
  if (
    contains(text, 'follow-up', 'follow up', 'followup') &&
    (contains(text, 'initial order') || contains(text, 'qualifying'))
  ) {
    return { rule: buildBl46(), confidence: 0.93 };
  }

  // BL3 — assign Pediatric priority for patients under 19.
  if (contains(text, 'pediatric', 'under 19', 'under nineteen', 'paediatric')) {
    return { rule: buildBl3(), confidence: 0.9 };
  }

  // BL8 — NY-regulated order requires NY-validated performing lab.
  if (
    contains(text, 'ny', 'new york') &&
    contains(text, 'validated', 'validation')
  ) {
    return { rule: buildBl8(), confidence: 0.9 };
  }

  return null;
}

function success(
  rule: RuleDefinition,
  confidence: number,
  naturalLanguage: string,
): InterpretationResult {
  return {
    candidate: rule,
    confidence,
    grounding: summarizeGrounding(rule, []),
    unmappedPhrases: [],
    gaps: [],
    termProposals: [],
    naturalLanguage,
    interpreterVersion: STUB_INTERPRETER_VERSION,
    model: OFFLINE_MODEL,
  };
}

function unrecognized(naturalLanguage: string): InterpretationResult {
  const trimmed = (naturalLanguage ?? '').trim();
  return {
    candidate: null,
    confidence: 0,
    grounding: summarizeGrounding(null, trimmed === '' ? [] : [trimmed]),
    unmappedPhrases: trimmed === '' ? [] : [trimmed],
    gaps: [
      'The offline stub interpreter does not recognise this rule. It maps only a small set of known phrasings ' +
        '(circled H&E + FISH, follow-up + initial order, pediatric/under-19, NY + validated). ' +
        'Use the live OpenAI interpreter for arbitrary natural language.',
    ],
    termProposals: [],
    naturalLanguage,
    interpreterVersion: STUB_INTERPRETER_VERSION,
    model: OFFLINE_MODEL,
  };
}

function contains(text: string, ...anyOf: string[]): boolean {
  return anyOf.some((needle) => text.includes(needle));
}

// ── Corpus rule builders (mirror rules/*.json and the .NET stub) ─────────────────

function baseRule(
  partial: Partial<RuleDefinition> & {
    key: string;
    name: string;
    onFailure: RuleDefinition['onFailure'];
  },
): RuleDefinition {
  return {
    priority: 0,
    phase: 'Validate',
    enabled: true,
    version: 1,
    effectiveDate: '0001-01-01T00:00:00+00:00',
    onSuccess: { type: 'Continue', parameters: {} },
    ...partial,
  };
}

function buildPm17(): RuleDefinition {
  return baseRule({
    key: 'PM17',
    name: 'Circled H&E required for Technical FISH on FFPE',
    description:
      'A circled H&E slide must be present when a Technical FISH test is ordered on an FFPE specimen.',
    priority: 10,
    phase: 'Validate',
    appliesWhen: {
      type: 'group',
      logicalOp: 'All',
      conditions: [
        {
          type: 'leaf',
          subject: 'test.code',
          operator: 'InSet',
          reference: 'TechnicalFISH',
        },
        {
          type: 'leaf',
          subject: 'test.specimen.type',
          operator: 'Equals',
          value: 'FFPE',
        },
      ],
    },
    assert: {
      type: 'leaf',
      subject: 'document.circledHE',
      operator: 'IsPresent',
    },
    onFailure: {
      type: 'CompleteHold',
      scope: 'order',
      reason: 'Circled H&E not present for Technical FISH on FFPE',
      parameters: {},
    },
  });
}

function buildBl46(): RuleDefinition {
  return baseRule({
    key: 'BL46',
    name: 'Follow-up order requires qualifying initial order',
    description:
      'A follow-up order may only be submitted when a qualifying initial order already exists for the patient; otherwise submission is prevented.',
    priority: 40,
    phase: 'Validate',
    appliesWhen: {
      type: 'leaf',
      subject: 'order.type',
      operator: 'Equals',
      value: 'FollowUp',
    },
    assert: {
      type: 'leaf',
      subject: 'order.qualifyingInitialOrder',
      operator: 'IsPresent',
    },
    onFailure: {
      type: 'PreventAction',
      scope: 'order',
      reason: 'No qualifying initial order exists for this patient',
      parameters: { Action: 'submit-order' },
    },
  });
}

function buildBl3(): RuleDefinition {
  return baseRule({
    key: 'BL3',
    name: 'Assign Pediatric priority for patients under 19',
    description:
      "Stamps test.priority = 'Pediatric' when patient.age < pediatricAge threshold.",
    priority: 10,
    phase: 'Derive',
    appliesWhen: {
      type: 'leaf',
      subject: 'patient.age',
      operator: 'LessThan',
      reference: 'PolicyThresholds.pediatricAge',
    },
    onFailure: {
      type: 'SetValue',
      scope: 'test',
      reason: 'Pediatric priority derived from patient age',
      parameters: { Target: 'test.priority', Value: 'Pediatric' },
    },
  });
}

function buildBl8(): RuleDefinition {
  return baseRule({
    key: 'BL8',
    name: 'NY-regulated order requires NY-validated performing lab',
    description:
      'When the ordering client is NY-regulated, the performing lab must be on the NY-validated lab list.',
    priority: 30,
    phase: 'Validate',
    appliesWhen: {
      type: 'leaf',
      subject: 'order.client.nyStatus',
      operator: 'Equals',
      value: 'NYRegulated',
    },
    assert: {
      type: 'leaf',
      subject: 'order.performingLab',
      operator: 'IsEligibleFor',
      reference: 'TestCompendium.nyValidation',
    },
    onFailure: {
      type: 'ComplianceAlert',
      scope: 'order',
      reason: 'Performing lab not on NY-validated list for NY-regulated client',
      severity: 'informational',
      parameters: {},
    },
  });
}
