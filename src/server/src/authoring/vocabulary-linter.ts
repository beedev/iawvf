/**
 * The registry-grounded vocabulary linter.
 *
 * This is the key divergence from the .NET {@link ../../backend/IAW.Vdf.Authoring/Linting/VocabularyLinter.cs}:
 * the .NET linter grounds subject validation on a STATIC `VocabularyCatalog`,
 * whereas this one grounds on the LIVE entity registry projection (N1/N3). The
 * legal subjects are exactly the Active `entity.field` paths the registry knows,
 * and — because the registry is typed — we can additionally catch operator/type
 * mismatches the static catalog could never see (LINT020).
 *
 * Sanity checks (missing outcome params, assert-with-Continue) mirror the .NET
 * linter so the corpus lints identically across both stacks.
 */

import { FieldDataType } from '@prisma/client';

import { ReferenceDataProvider } from '../vdf/reference-data';
import { deserializeRule } from '../vdf/serializer';
import {
  Condition,
  GroupCondition,
  LeafCondition,
  Outcome,
  RecoveryStrategy,
  RuleDefinition,
} from '../vdf/types';

/** Severity of a single lint finding. */
export type FindingSeverity = 'Error' | 'Warning';

/** A single diagnostic produced by the linter. */
export interface LintFinding {
  severity: FindingSeverity;
  /** Machine-readable code (e.g. `LINT001`). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** The logical path within the rule where the issue was found. */
  path: string;
}

/** A complete lint report for one rule. */
export interface LintReport {
  /** True when there are no `Error`-severity findings. */
  isValid: boolean;
  /** Every finding (errors and warnings). */
  findings: LintFinding[];
}

/**
 * A grounded subject the linter validates against: the legal canonical path, its
 * registry data type, and any declared closed value set. This is the projected
 * shape from {@link ../rules/vocabulary-projection.service.GroundedSubject}, kept
 * as a structural type so the pure linter carries no NestJS/Prisma coupling.
 */
export interface GroundingSubject {
  path: string;
  dataType: FieldDataType;
  allowedValues: string[];
}

/** Operators that imply a numeric/ordered comparison (illegal on free String fields). */
const NUMERIC_OPERATORS = new Set<LeafCondition['operator']>([
  'GreaterThan',
  'LessThan',
  'GreaterOrEqual',
  'LessOrEqual',
  'WithinRange',
]);

/**
 * Validates a {@link RuleDefinition} against the registry-projected grounding
 * vocabulary and a reference-data provider. Construct one per grounding snapshot;
 * it is otherwise stateless and deterministic.
 */
export class VocabularyLinter {
  private readonly byPath: Map<string, GroundingSubject>;
  private readonly knownPaths: Set<string>;

  /**
   * @param subjects The grounding vocabulary (registry-projected legal subjects).
   * @param references Reference-data provider used to resolve `reference` keys.
   */
  constructor(
    subjects: readonly GroundingSubject[],
    private readonly references: ReferenceDataProvider,
  ) {
    // The registry canonicalises entity keys to lower-case (its documented
    // case-insensitive identity), so the projected paths carry a lower-case
    // entity segment while field segments keep their authored case. We index by
    // that same normalisation so a corpus subject like `medicalReview.decision`
    // matches the projected `medicalreview.decision` without masking field typos.
    this.byPath = new Map(subjects.map((s) => [normalizeEntity(s.path), s]));
    this.knownPaths = new Set(this.byPath.keys());
  }

  /** Lints an already-deserialized rule. */
  lint(rule: RuleDefinition): LintReport {
    const findings: LintFinding[] = [];

    if (rule.appliesWhen) {
      this.lintCondition(rule.appliesWhen, 'appliesWhen', findings);
    }
    if (rule.assert) {
      this.lintCondition(rule.assert, 'assert', findings);
    }

    this.lintOutcome(rule.onSuccess, 'onSuccess', findings);
    this.lintOutcome(rule.onFailure, 'onFailure', findings);

    if (rule.recover) {
      this.lintRecovery(rule.recover, findings);
    }

    // LINT101 (Warning): asserts a condition but OnFailure is a no-op Continue.
    if (rule.assert && rule.onFailure.type === 'Continue') {
      findings.push({
        severity: 'Warning',
        code: 'LINT101',
        message:
          'Rule asserts a condition but OnFailure is Continue — did you mean to produce a hold or alert?',
        path: 'onFailure',
      });
    }

    const isValid = !findings.some((f) => f.severity === 'Error');
    return { isValid, findings };
  }

  /** Deserializes the JSON then lints; deserialization failures become a LINT000 error. */
  lintJson(ruleJson: string): LintReport {
    let rule: RuleDefinition;
    try {
      rule = deserializeRule(ruleJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isValid: false,
        findings: [
          {
            severity: 'Error',
            code: 'LINT000',
            message: `Failed to deserialize rule JSON: ${message}`,
            path: '',
          },
        ],
      };
    }
    return this.lint(rule);
  }

  // ── Conditions ────────────────────────────────────────────────────────────

  private lintCondition(
    condition: Condition,
    path: string,
    findings: LintFinding[],
  ): void {
    if (condition.type === 'leaf') {
      this.lintLeaf(condition, path, findings);
      return;
    }
    const group: GroupCondition = condition;
    group.conditions.forEach((child, i) =>
      this.lintCondition(child, `${path}.conditions[${i}]`, findings),
    );
  }

  private lintLeaf(
    leaf: LeafCondition,
    path: string,
    findings: LintFinding[],
  ): void {
    const subject = this.resolveSubject(leaf.subject);

    // LINT001 (Error): unknown subject — not a known entity.field in the registry.
    if (subject === undefined) {
      findings.push({
        severity: 'Error',
        code: 'LINT001',
        message: `Unknown subject '${leaf.subject}' — not a known entity.field in the registry`,
        path: `${path}.subject`,
      });
    }

    // LINT003 (Error): reference key the engine cannot resolve.
    if (leaf.reference !== undefined) {
      if (!this.references.tryResolve(leaf.reference).found) {
        findings.push({
          severity: 'Error',
          code: 'LINT003',
          message: `Unknown reference '${leaf.reference}'`,
          path: `${path}.reference`,
        });
      }
    }

    // LINT020 (Warning): type-aware operator/value mismatch — leverages the
    // registry's declared field type + allowedValues (the typed-registry payoff).
    if (subject !== undefined) {
      this.lintTypeMismatch(leaf, subject, path, findings);
    }
  }

  /**
   * LINT020: registry-type-aware operator/value sanity.
   *  - A numeric/range operator (GreaterThan/LessThan/GreaterOrEqual/LessOrEqual/
   *    WithinRange) applied to a String field is almost certainly a mistake.
   *  - An InSet/Equals against an `allowedValues` field with an inline value
   *    outside the declared set is a mistake.
   */
  private lintTypeMismatch(
    leaf: LeafCondition,
    subject: GroundingSubject,
    path: string,
    findings: LintFinding[],
  ): void {
    if (
      NUMERIC_OPERATORS.has(leaf.operator) &&
      subject.dataType === FieldDataType.String
    ) {
      findings.push({
        severity: 'Warning',
        code: 'LINT020',
        message: `Operator '${leaf.operator}' is numeric/range but subject '${subject.path}' is a String field`,
        path: `${path}.operator`,
      });
      return;
    }

    if (
      (leaf.operator === 'InSet' ||
        leaf.operator === 'NotInSet' ||
        leaf.operator === 'Equals' ||
        leaf.operator === 'NotEquals') &&
      subject.allowedValues.length > 0 &&
      typeof leaf.value === 'string' &&
      !subject.allowedValues.includes(leaf.value)
    ) {
      findings.push({
        severity: 'Warning',
        code: 'LINT020',
        message: `Value '${leaf.value}' is not among the allowed values for '${subject.path}' [${subject.allowedValues.join(', ')}]`,
        path: `${path}.value`,
      });
    }
  }

  // ── Outcomes ──────────────────────────────────────────────────────────────

  private lintOutcome(
    outcome: Outcome,
    path: string,
    findings: LintFinding[],
  ): void {
    // LINT002 (Error): unknown outcome type. The serializer rejects unknown types
    // up-front, but a directly-constructed RuleDefinition could still carry one.
    if (!KNOWN_OUTCOME_TYPES.has(outcome.type)) {
      findings.push({
        severity: 'Error',
        code: 'LINT002',
        message: `Unknown outcome type '${outcome.type}'`,
        path: `${path}.type`,
      });
    }

    requireParam(
      outcome,
      'CreatePlaceholder',
      'SpecimenType',
      'LINT005',
      path,
      findings,
    );
    requireParam(
      outcome,
      'RouteToReview',
      'Destination',
      'LINT006',
      path,
      findings,
    );
    requireParam(outcome, 'PreventAction', 'Action', 'LINT007', path, findings);

    // LINT008 (Error): derivation outcome without a Target.
    if (
      outcome.type === 'SetValue' ||
      outcome.type === 'ApplyDefault' ||
      outcome.type === 'CalculateValue'
    ) {
      if (isBlank(outcome.parameters['Target'])) {
        findings.push({
          severity: 'Error',
          code: 'LINT008',
          message: 'Derivation outcome missing Target parameter',
          path: `${path}.parameters.Target`,
        });
      }
    }

    // LINT102 (Warning): AllowAction without an Action.
    if (
      outcome.type === 'AllowAction' &&
      isBlank(outcome.parameters['Action'])
    ) {
      findings.push({
        severity: 'Warning',
        code: 'LINT102',
        message: 'AllowAction outcome missing Action parameter',
        path: `${path}.parameters.Action`,
      });
    }
  }

  private lintRecovery(
    recover: RecoveryStrategy,
    findings: LintFinding[],
  ): void {
    // LINT004 (Error): recovery references an unresolvable reference key.
    const refVal = recover.parameters['Reference'];
    if (typeof refVal === 'string' && refVal.trim() !== '') {
      if (!this.references.tryResolve(refVal).found) {
        findings.push({
          severity: 'Error',
          code: 'LINT004',
          message: `Recovery references unknown key '${refVal}'`,
          path: 'recover.parameters.Reference',
        });
      }
    }
  }

  // ── Subject resolution ──────────────────────────────────────────────────────

  /**
   * Resolves a subject path to its grounding entry, normalising array fan-out:
   * `order.specimens[].type` falls back to the base collection field
   * `order.specimens[]` (matching the .NET linter's `IsKnownSubjectPath`).
   */
  private resolveSubject(subject: string): GroundingSubject | undefined {
    const normalized = normalizeEntity(subject);
    const direct = this.byPath.get(normalized);
    if (direct !== undefined) {
      return direct;
    }
    const bracket = normalized.indexOf('[]');
    if (bracket >= 0) {
      const base = normalized.slice(0, bracket + 2);
      if (this.knownPaths.has(base)) {
        return this.byPath.get(base);
      }
    }
    return undefined;
  }
}

/**
 * Normalises a subject path's ENTITY (first dot-segment) to lower-case, leaving
 * field segments untouched. Mirrors the registry's canonical key form so subject
 * matching is case-insensitive on the entity (e.g. `medicalReview.decision` →
 * `medicalreview.decision`) without masking case-sensitive field typos.
 */
function normalizeEntity(path: string): string {
  const dot = path.indexOf('.');
  if (dot < 0) {
    return path.toLowerCase();
  }
  return path.slice(0, dot).toLowerCase() + path.slice(dot);
}

/** The closed set of legal outcome types (mirrors {@link OutcomeType}). */
const KNOWN_OUTCOME_TYPES = new Set<string>([
  'Continue',
  'Suppressed',
  'CompleteHold',
  'PartialHold',
  'Warning',
  'ComplianceAlert',
  'RouteToReview',
  'RouteToQueue',
  'Escalate',
  'SetValue',
  'ApplyDefault',
  'CalculateValue',
  'CreatePlaceholder',
  'CreateIncident',
  'CreateTask',
  'PreventAction',
  'AllowAction',
]);

/** True when a parameter value is null/undefined or blank-string. */
function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/** Adds an Error finding when `outcome` is of `type` but lacks a non-blank `param`. */
function requireParam(
  outcome: Outcome,
  type: Outcome['type'],
  param: string,
  code: string,
  path: string,
  findings: LintFinding[],
): void {
  if (outcome.type === type && isBlank(outcome.parameters[param])) {
    findings.push({
      severity: 'Error',
      code,
      message: `${type} outcome missing ${param} parameter`,
      path: `${path}.parameters.${param}`,
    });
  }
}
