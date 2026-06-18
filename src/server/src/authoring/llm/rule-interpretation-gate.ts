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
 */

import { SchemaValidator } from '../schema-validator';
import { VocabularyLinter } from '../vocabulary-linter';

import { InterpretationResult } from './interpreter';
import { ModelEnvelope } from './model-envelope';

import { deserializeRule } from '../../vdf/serializer';
import { RuleDefinition } from '../../vdf/types';

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

    // The model declined to produce a candidate — honour that as-is.
    if (
      envelope.candidateJson === null ||
      envelope.candidateJson === undefined ||
      envelope.candidateJson.trim() === ''
    ) {
      if (gaps.length === 0) {
        gaps.push(
          'The model did not produce a candidate rule and gave no reason; the sentence could not be grounded in the registry vocabulary.',
        );
      }
      return this.build(
        null,
        clamp(envelope.confidence),
        unmapped,
        gaps,
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
      return this.rejected(unmapped, gaps, provenance);
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
      return this.rejected(unmapped, gaps, provenance);
    }

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
      return this.rejected(unmapped, gaps, provenance);
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

    return this.build(candidate, confidence, unmapped, gaps, provenance);
  }

  /** Per "no silent invention": reject the candidate entirely (null, confidence 0). */
  private rejected(
    unmapped: string[],
    gaps: string[],
    provenance: GateProvenance,
  ): InterpretationResult {
    return this.build(null, 0, unmapped, gaps, provenance);
  }

  private build(
    candidate: RuleDefinition | null,
    confidence: number,
    unmapped: string[],
    gaps: string[],
    provenance: GateProvenance,
  ): InterpretationResult {
    return {
      candidate,
      confidence,
      unmappedPhrases: unmapped,
      gaps,
      naturalLanguage: provenance.naturalLanguage,
      interpreterVersion: provenance.interpreterVersion,
      model: provenance.model,
    };
  }
}

/** Clamps a confidence value into [0, 1]. */
function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
