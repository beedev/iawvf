/**
 * The deterministic validation gate that turns a model envelope into a trustworthy
 * {@link InterpretationResult}.
 *
 * A faithful port of {@link ../../../../backend/IAW.Vdf.Authoring.Llm/Interpretation/RuleInterpretationGate.cs},
 * adapted to ground on the LIVE registry projection (N3) via the N4
 * {@link VocabularyLinter} rather than a static catalog. This is the enforcement
 * point for "grounding, not guessing": regardless of what the model claimed, a
 * candidate is only returned if it
 *   (a) passes the rule JSON schema (N4 {@link SchemaValidator}),
 *   (b) deserializes into a {@link RuleDefinition}, and
 *   (c) lints clean against the live registry vocabulary with ZERO Error findings.
 * Any schema/lint Error (unknown subject, operator, reference, or outcome) is
 * converted into a propose-new-term GAP and the candidate is SUPPRESSED
 * (`candidate = null`, `confidence = 0`). Lint Warnings keep the candidate but
 * dampen confidence. Contains NO network code, so it is fully unit-testable with a
 * canned model envelope.
 *
 * Beyond the human-readable gaps, the gate SYNTHESIZES structured
 * {@link TermProposal}s from any leaf whose subject is unknown to the registry
 * (LINT001): the exact `entity.field` to add, its inferred data type, and whether the
 * entity already exists. This is the deterministic source the Authoring UI uses to
 * offer "add the term and re-interpret" inline — independent of the model's output.
 */

import { SchemaValidator } from '../schema-validator';
import { VocabularyLinter } from '../vocabulary-linter';

import { InterpretationResult, TermProposal } from './interpreter';
import { ModelEnvelope, ModelTermProposal } from './model-envelope';

import { deserializeRule } from '../../vdf/serializer';
import {
  Condition,
  LeafCondition,
  JsonValue,
  RuleDefinition,
} from '../../vdf/types';

/** Operators that imply a numeric/ordered comparand — infer a Number term. */
const NUMERIC_OPERATORS = new Set<LeafCondition['operator']>([
  'GreaterThan',
  'LessThan',
  'GreaterOrEqual',
  'LessOrEqual',
  'WithinRange',
]);

/** Operators whose inline value is a closed literal set — infer String + allowedValues. */
const SET_OPERATORS = new Set<LeafCondition['operator']>(['InSet', 'NotInSet']);

/** Provenance carried through the gate onto the produced result. */
export interface GateProvenance {
  /** The original natural-language text. */
  naturalLanguage: string;
  /** The interpreter version that produced the envelope. */
  interpreterVersion: string;
  /** The model id used. */
  model: string;
}

/**
 * Validates a parsed model envelope and produces the final interpretation result.
 * Stateless given its injected validator + linter; construct one per grounding
 * snapshot (the linter is bound to a registry projection).
 */
export class RuleInterpretationGate {
  constructor(
    private readonly schema: SchemaValidator,
    private readonly linter: VocabularyLinter,
  ) {}

  /**
   * The method tests call directly with a canned envelope — no network required.
   * `candidate` is non-null only when the rule is schema-valid and lint-clean.
   */
  validate(
    envelope: ModelEnvelope,
    provenance: GateProvenance,
  ): InterpretationResult {
    const gaps: string[] = [...(envelope.gaps ?? [])];
    const unmapped: string[] = [...(envelope.unmappedPhrases ?? [])];

    // Normalise any MODEL-emitted term proposals up-front: this is the primary path
    // when a well-behaved model DECLINES (candidate=null) and names the missing term
    // itself rather than fabricating a rule that uses it. Gate-synthesis (from a
    // candidate's unknown leaves) is the fallback; the two are merged (dedupe by path).
    const modelProposals = this.normalizeModelProposals(
      envelope.termProposals,
      provenance.naturalLanguage,
    );

    // The model declined to produce a candidate — honour that as-is.
    if (
      envelope.candidateJson === null ||
      envelope.candidateJson === undefined ||
      envelope.candidateJson.trim() === ''
    ) {
      if (gaps.length === 0 && modelProposals.length === 0) {
        gaps.push(
          'The model did not produce a candidate rule and gave no reason; the sentence could not be grounded in the registry vocabulary.',
        );
      }
      return this.build(
        null,
        clamp(envelope.confidence),
        unmapped,
        gaps,
        modelProposals,
        provenance,
      );
    }

    // (a) Schema validation against rule.schema.json (structural correctness).
    const schemaResult = this.schema.validateRule(envelope.candidateJson);
    if (!schemaResult.valid) {
      for (const error of schemaResult.errors) {
        const at = error.path === '' ? '(root)' : error.path;
        gaps.push(
          `Proposed rule failed schema validation at '${at}': ${error.message}`,
        );
      }
      return this.rejected(unmapped, gaps, modelProposals, provenance);
    }

    // (b) Deserialization into a RuleDefinition.
    let candidate: RuleDefinition;
    try {
      candidate = deserializeRule(envelope.candidateJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gaps.push(
        `Proposed rule could not be deserialized into a RuleDefinition: ${message}`,
      );
      return this.rejected(unmapped, gaps, modelProposals, provenance);
    }

    // Synthesize structured term proposals from every leaf with an unknown subject
    // (deterministic, derived from real usage), then MERGE the model's own proposals
    // (deduped by path). Gate-synthesized entries win on a path collision since they
    // carry the exact operator/value-inferred type.
    const termProposals = mergeProposals(
      this.synthesizeTermProposals(candidate, provenance.naturalLanguage),
      modelProposals,
    );

    // (c) Registry-grounded lint — the closed-vocabulary enforcement (no invented terms).
    const report = this.linter.lint(candidate);
    const lintErrors = report.findings.filter((f) => f.severity === 'Error');
    const lintWarnings = report.findings.filter(
      (f) => f.severity === 'Warning',
    );

    if (lintErrors.length > 0) {
      // Convert each error into a propose-new-term gap; suppress the candidate. No silent invention.
      for (const error of lintErrors) {
        gaps.push(
          `${error.code}: ${error.message} (at ${error.path}). This term is not in the controlled vocabulary — raise a vocabulary-change request before this rule can be authored.`,
        );
      }
      return this.rejected(unmapped, gaps, termProposals, provenance);
    }

    // Clean candidate. Dampen confidence if the linter raised warnings (suspicious but not fatal).
    let confidence = clamp(envelope.confidence);
    if (lintWarnings.length > 0) {
      confidence *= 0.75;
      for (const warning of lintWarnings) {
        gaps.push(
          `Lint warning ${warning.code}: ${warning.message} (at ${warning.path}). Review before approval.`,
        );
      }
    }

    return this.build(
      candidate,
      confidence,
      unmapped,
      gaps,
      termProposals,
      provenance,
    );
  }

  /**
   * Walks the candidate's `appliesWhen` + `assert` condition trees and synthesizes a
   * {@link TermProposal} for every LEAF whose subject is not a known registry subject.
   * Deduped by canonical path (trailing `[]` stripped). Returns `[]` for a fully
   * grounded candidate.
   */
  private synthesizeTermProposals(
    rule: RuleDefinition,
    phrase: string,
  ): TermProposal[] {
    const byPath = new Map<string, TermProposal>();
    const visit = (condition: Condition): void => {
      if (condition.type === 'leaf') {
        const proposal = this.proposalForLeaf(condition, phrase);
        if (proposal !== null && !byPath.has(proposal.path)) {
          byPath.set(proposal.path, proposal);
        }
        return;
      }
      condition.conditions.forEach(visit);
    };
    if (rule.appliesWhen) {
      visit(rule.appliesWhen);
    }
    if (rule.assert) {
      visit(rule.assert);
    }
    return [...byPath.values()];
  }

  /**
   * Builds a {@link TermProposal} for one leaf, or `null` when its subject is already
   * grounded. The data type is inferred from the leaf's operator/value (see class doc).
   */
  private proposalForLeaf(
    leaf: LeafCondition,
    phrase: string,
  ): TermProposal | null {
    if (this.linter.isKnownSubject(leaf.subject)) {
      return null;
    }

    // Canonicalise: strip a trailing collection marker; split entity.field.
    const path = leaf.subject.endsWith('[]')
      ? leaf.subject.slice(0, -2)
      : leaf.subject;
    const dot = path.indexOf('.');
    const entity = dot < 0 ? path : path.slice(0, dot);
    const field = dot < 0 ? '' : path.slice(dot + 1);

    const { dataType, allowedValues } = inferType(leaf);

    return {
      phrase: phrase.trim() === '' ? undefined : phrase,
      entity,
      field,
      path,
      dataType,
      ...(allowedValues !== undefined ? { allowedValues } : {}),
      entityExists: this.linter.isKnownEntity(entity),
      rationale: rationaleFor(leaf),
    };
  }

  /**
   * Normalises raw MODEL-emitted proposals into full {@link TermProposal}s: derives
   * the canonical `entity.field` path, checks the live registry for `entityExists`,
   * and defaults `dataType` to `String` when the model omits it. Skips entries that
   * already resolve to a known subject (the model over-proposed). Deduped by path.
   */
  private normalizeModelProposals(
    proposals: ModelTermProposal[] | undefined,
    naturalLanguage: string,
  ): TermProposal[] {
    if (proposals === undefined || proposals.length === 0) {
      return [];
    }
    const byPath = new Map<string, TermProposal>();
    for (const raw of proposals) {
      const rawEntity = raw.entity.trim();
      const rawField = raw.field.trim();
      if (rawEntity === '' || rawField === '') {
        continue;
      }
      const path = `${rawEntity}.${rawField}`;
      // The model may split a nested path as entity="order.client" / field="program".
      // Re-derive the CANONICAL split (entity = first segment, field = remainder) so the
      // entity is a real registry entity the Authoring UI can add a field to.
      const dot = path.indexOf('.');
      const entity = dot < 0 ? path : path.slice(0, dot);
      const field = dot < 0 ? '' : path.slice(dot + 1);
      // The model may propose a term that actually IS grounded — drop it.
      if (this.linter.isKnownSubject(path) || byPath.has(path)) {
        continue;
      }
      const phrase =
        raw.phrase !== undefined && raw.phrase.trim() !== ''
          ? raw.phrase
          : naturalLanguage.trim() === ''
            ? undefined
            : naturalLanguage;
      byPath.set(path, {
        ...(phrase !== undefined ? { phrase } : {}),
        entity,
        field,
        path,
        dataType: raw.dataType ?? 'String',
        ...(raw.allowedValues !== undefined && raw.allowedValues.length > 0
          ? { allowedValues: raw.allowedValues }
          : {}),
        entityExists: this.linter.isKnownEntity(entity),
        rationale:
          raw.rationale !== undefined && raw.rationale.trim() !== ''
            ? raw.rationale
            : `The rule needs '${path}', which is not yet in the vocabulary.`,
      });
    }
    return [...byPath.values()];
  }

  /** Per "no silent invention": reject the candidate entirely (null, confidence 0). */
  private rejected(
    unmapped: string[],
    gaps: string[],
    termProposals: TermProposal[],
    provenance: GateProvenance,
  ): InterpretationResult {
    return this.build(null, 0, unmapped, gaps, termProposals, provenance);
  }

  private build(
    candidate: RuleDefinition | null,
    confidence: number,
    unmapped: string[],
    gaps: string[],
    termProposals: TermProposal[],
    provenance: GateProvenance,
  ): InterpretationResult {
    return {
      candidate,
      confidence,
      unmappedPhrases: unmapped,
      gaps,
      termProposals,
      naturalLanguage: provenance.naturalLanguage,
      interpreterVersion: provenance.interpreterVersion,
      model: provenance.model,
    };
  }
}

/**
 * Merges two {@link TermProposal} lists, deduping by canonical path. `primary` entries
 * win on a path collision (they carry the more precise, usage-derived type), with the
 * `secondary` (model) entries appended for any path the primary did not cover. Used to
 * combine gate-synthesized proposals (primary) with model-emitted ones (secondary).
 */
function mergeProposals(
  primary: TermProposal[],
  secondary: TermProposal[],
): TermProposal[] {
  const byPath = new Map<string, TermProposal>();
  for (const proposal of [...primary, ...secondary]) {
    if (!byPath.has(proposal.path)) {
      byPath.set(proposal.path, proposal);
    }
  }
  return [...byPath.values()];
}

/**
 * Infers a registry data type (and any closed value set) from a leaf's operator and
 * inline value:
 *  - comparison/range operators → Number;
 *  - InSet/NotInSet against a literal array → String WITH allowedValues = that array;
 *  - a boolean inline value → Boolean;
 *  - a date-shaped string value → Date;
 *  - IsPresent/IsAbsent or any string value → String (the safe default).
 */
function inferType(leaf: LeafCondition): {
  dataType: TermProposal['dataType'];
  allowedValues?: string[];
} {
  if (NUMERIC_OPERATORS.has(leaf.operator)) {
    return { dataType: 'Number' };
  }

  if (SET_OPERATORS.has(leaf.operator) || leaf.operator === 'Equals') {
    const literals = stringLiterals(leaf.value);
    if (literals !== null && literals.length > 0) {
      return { dataType: 'String', allowedValues: literals };
    }
  }

  if (typeof leaf.value === 'boolean') {
    return { dataType: 'Boolean' };
  }
  if (typeof leaf.value === 'number') {
    return { dataType: 'Number' };
  }
  if (typeof leaf.value === 'string') {
    return { dataType: isDateShaped(leaf.value) ? 'Date' : 'String' };
  }

  // IsPresent/IsAbsent and reference-backed leaves carry no inline literal — String.
  return { dataType: 'String' };
}

/** The literal string members of an InSet/Equals comparand, or `null` if not a string set. */
function stringLiterals(value: JsonValue | undefined): string[] | null {
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === 'string');
    return strings.length === value.length ? strings : null;
  }
  if (typeof value === 'string') {
    return [value];
  }
  return null;
}

/** True for an ISO-8601-ish date/date-time literal (a heuristic for Date inference). */
function isDateShaped(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(value);
}

/** A short human rationale describing how the rule uses the (unknown) subject. */
function rationaleFor(leaf: LeafCondition): string {
  const comparand =
    leaf.reference !== undefined
      ? ` (ref: ${leaf.reference})`
      : leaf.value !== undefined
        ? ` ${JSON.stringify(leaf.value)}`
        : '';
  return `Used by the rule as ${leaf.subject} ${leaf.operator}${comparand} but not yet in the vocabulary.`;
}

/** Clamps a confidence value into [0, 1]. */
function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
