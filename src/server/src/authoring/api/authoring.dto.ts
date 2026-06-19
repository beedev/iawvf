import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DryRunResult } from '../dry-run-previewer';
import { LintReport } from '../vocabulary-linter';
import { VocabularySuggestion } from '../vocabulary-suggester';
import {
  GroundingSummary,
  InterpretationResult,
  ProposalEvaluation,
  TermProposal,
} from '../llm/interpreter';
import { RuleDefinition } from '../../vdf/types';
import { VocabularyTree } from '../../rules/vocabulary-projection.service';

/** Request to interpret a natural-language rule into the controlled vocabulary. */
export class InterpretRequestDto {
  @ApiProperty({ description: "The author's plain-English rule." })
  @IsString()
  @MaxLength(4000) // Bound LLM input size to curb cost / DoS via oversized prompts.
  naturalLanguage!: string;

  @ApiPropertyOptional({
    description:
      'Optional object-level scope (object names, e.g. ["specimen"]). Ignored when ' +
      'properties is non-empty.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  objects?: string[];

  @ApiPropertyOptional({
    description:
      'Optional property-level scope (full subject paths, e.g. ' +
      '["specimen.fixationTime"]). Takes precedence over objects.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(256)
  @IsString({ each: true })
  properties?: string[];
}

/** A request carrying a raw rule JSON object (lint / paraphrase / dry-run). */
export class RuleJsonRequestDto {
  @ApiProperty({
    description: 'The rule definition as a JSON object.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  ruleJson!: Record<string, unknown>;
}

/**
 * A structured "missing vocabulary term" proposal projected for the API response.
 * The Authoring UI uses this to offer an inline "add the term and re-interpret".
 */
export class TermProposalDto {
  @ApiPropertyOptional({
    description: 'The natural-language phrase that motivated the term.',
  })
  phrase?: string;
  @ApiProperty({
    description: "The proposed entity (the path's first segment).",
  })
  entity!: string;
  @ApiProperty({
    description: 'The proposed field (the remainder of the path).',
  })
  field!: string;
  @ApiProperty({ description: 'The full canonical entity.field subject path.' })
  path!: string;
  @ApiProperty({
    enum: ['String', 'Number', 'Date', 'Boolean', 'Collection'],
    description: 'The inferred registry field data type.',
  })
  dataType!: TermProposal['dataType'];
  @ApiPropertyOptional({
    type: [String],
    description:
      'A closed value set inferred from an InSet/Equals literal array.',
  })
  allowedValues?: string[];
  @ApiProperty({
    description: 'Whether the entity is already a known registry entity.',
  })
  entityExists!: boolean;
  @ApiProperty({ description: 'Why this term is being proposed.' })
  rationale!: string;
}

/**
 * The verdict of the SANDBOX proposal evaluation, projected for the API response. The
 * Authoring UI uses `improves` to decide whether to surface the term proposals at all
 * (and `projectedConfidence` to explain how much they would help). `null` on the
 * response when there were no proposals to evaluate (no sandbox call was made).
 */
export class ProposalEvaluationDto {
  @ApiProperty({
    description: 'Confidence of the base interpretation (current vocabulary).',
  })
  baselineConfidence!: number;
  @ApiProperty({
    description:
      'Confidence of the sandbox interpretation (vocabulary + proposed terms).',
  })
  projectedConfidence!: number;
  @ApiProperty({
    description: 'Whether the sandbox interpretation produced a candidate.',
  })
  groundsCandidate!: boolean;
  @ApiProperty({
    description: 'Whether the base interpretation already had a candidate.',
  })
  baselineHadCandidate!: boolean;
  @ApiProperty({
    description: 'Count of unmapped phrases before adding the proposed terms.',
  })
  unmappedBefore!: number;
  @ApiProperty({
    description: 'Count of unmapped phrases after adding the proposed terms.',
  })
  unmappedAfter!: number;
  @ApiProperty({
    description:
      'Whether adding the proposed terms demonstrably improves the interpretation.',
  })
  improves!: boolean;

  static from(evaluation: ProposalEvaluation): ProposalEvaluationDto {
    return {
      baselineConfidence: evaluation.baselineConfidence,
      projectedConfidence: evaluation.projectedConfidence,
      groundsCandidate: evaluation.groundsCandidate,
      baselineHadCandidate: evaluation.baselineHadCandidate,
      unmappedBefore: evaluation.unmappedBefore,
      unmappedAfter: evaluation.unmappedAfter,
      improves: evaluation.improves,
    };
  }
}

/** The grounding verdict projected for the API response (mirrors `GroundingSummary`). */
export class GroundingDto {
  @ApiProperty({
    enum: ['grounded', 'partial', 'ungrounded'],
    description:
      'How completely the sentence grounded: grounded (savable), partial (provisional — ' +
      'some phrase still unmapped), or ungrounded (no candidate).',
  })
  status!: GroundingSummary['status'];
  @ApiProperty({
    description: 'True only for a fully grounded candidate. The Save action is gated on this.',
  })
  savable!: boolean;
  @ApiPropertyOptional({
    description: 'When not savable, a one-line reason naming what is unresolved.',
  })
  clarification?: string;

  static from(grounding: GroundingSummary): GroundingDto {
    return {
      status: grounding.status,
      savable: grounding.savable,
      ...(grounding.clarification !== undefined
        ? { clarification: grounding.clarification }
        : {}),
    };
  }
}

/** A relevant EXISTING vocabulary property suggested for the author's text (never invented). */
export class VocabularySuggestionDto {
  @ApiProperty({ description: 'The existing registry property path, e.g. specimen.bodySite.' })
  path!: string;
  @ApiProperty({ description: 'The property data type name.' })
  dataType!: string;
  @ApiProperty({
    type: [String],
    description: 'The text tokens that matched this property (the reason it was suggested).',
  })
  matched!: string[];

  static from(suggestion: VocabularySuggestion): VocabularySuggestionDto {
    return {
      path: suggestion.path,
      dataType: suggestion.dataType,
      matched: suggestion.matched,
    };
  }
}

/** The interpreter result projected for the API response (mirrors `InterpretResponse`). */
export class InterpretResponseDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  candidate!: Record<string, unknown> | null;
  @ApiProperty() confidence!: number;
  @ApiProperty({
    type: GroundingDto,
    description:
      'Deterministic grounding verdict. `grounding.savable` gates the Save action; a ' +
      'partially-grounded candidate is provisional and cannot be saved as-is.',
  })
  grounding!: GroundingDto;
  @ApiProperty({ type: [String] }) unmappedPhrases!: string[];
  @ApiProperty({ type: [String] }) gaps!: string[];
  @ApiProperty({
    type: [TermProposalDto],
    description:
      'Structured missing-vocabulary-term proposals the UI can add inline, then re-interpret. ' +
      'Surfaced only when the sandbox evaluation shows they improve the interpretation.',
  })
  termProposals!: TermProposalDto[];

  @ApiPropertyOptional({
    type: ProposalEvaluationDto,
    nullable: true,
    description:
      'The sandbox proposal-evaluation verdict, or null when there were no proposals ' +
      'to evaluate (no sandbox re-interpretation was performed).',
  })
  proposalEvaluation?: ProposalEvaluationDto | null;

  @ApiProperty({
    type: [VocabularySuggestionDto],
    description:
      'EXISTING registry properties relevant to the author\'s text (deterministic match; ' +
      'never invented). Empty means "unable to suggest" — nothing in the vocabulary matched.',
  })
  vocabularySuggestions!: VocabularySuggestionDto[];

  static from(
    result: InterpretationResult & {
      proposalEvaluation?: ProposalEvaluation | null;
    },
    vocabularySuggestions: readonly VocabularySuggestion[] = [],
  ): InterpretResponseDto {
    return {
      candidate:
        result.candidate === null
          ? null
          : (result.candidate as unknown as Record<string, unknown>),
      confidence: result.confidence,
      grounding: GroundingDto.from(result.grounding),
      unmappedPhrases: result.unmappedPhrases,
      gaps: result.gaps,
      termProposals: result.termProposals,
      proposalEvaluation:
        result.proposalEvaluation === undefined ||
        result.proposalEvaluation === null
          ? null
          : ProposalEvaluationDto.from(result.proposalEvaluation),
      vocabularySuggestions: vocabularySuggestions.map(
        VocabularySuggestionDto.from,
      ),
    };
  }
}

/** A single lint finding projected for the API response. */
export class LintFindingDto {
  @ApiProperty() severity!: string;
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty() path!: string;
}

/** The lint report projected for the API response (mirrors `LintReportDto`). */
export class LintReportDto {
  @ApiProperty() isValid!: boolean;
  @ApiProperty({ type: [LintFindingDto] }) findings!: LintFindingDto[];

  static from(report: LintReport): LintReportDto {
    return { isValid: report.isValid, findings: report.findings };
  }
}

/** The paraphrase response. */
export class ParaphraseResponseDto {
  @ApiProperty() paraphrase!: string;
}

/** A single dry-run hit projected for the API response. */
export class DryRunHitDto {
  @ApiProperty() fixtureName!: string;
  @ApiProperty() applied!: boolean;
  @ApiPropertyOptional({ nullable: true }) produced!: string | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
}

/** The dry-run response over the repo fixtures corpus. */
export class DryRunResponseDto {
  @ApiProperty() evaluated!: number;
  @ApiProperty({ type: [DryRunHitDto] }) hits!: DryRunHitDto[];

  static from(result: DryRunResult): DryRunResponseDto {
    return { evaluated: result.evaluated, hits: result.hits };
  }
}

/** A vocabulary property projected for the API response. */
export class VocabularyPropertyDto {
  @ApiProperty() path!: string;
  @ApiProperty() name!: string;
  @ApiProperty() dataType!: string;
}

/** A vocabulary object grouping its properties. */
export class VocabularyObjectDto {
  @ApiProperty() name!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: [VocabularyPropertyDto] })
  properties!: VocabularyPropertyDto[];
}

/** The controlled authoring vocabulary tree (mirrors `VocabularyTreeDto`). */
export class VocabularyResponseDto {
  @ApiProperty({ type: [VocabularyObjectDto] })
  objects!: VocabularyObjectDto[];
  @ApiProperty({ type: [String] }) operators!: string[];
  @ApiProperty({ type: [String] }) outcomes!: string[];

  static from(tree: VocabularyTree): VocabularyResponseDto {
    return {
      objects: tree.objects,
      operators: tree.operators,
      outcomes: tree.outcomes,
    };
  }
}

/** Re-export for the controller's parse helper. */
export type RuleJsonObject = Record<string, unknown>;
export type { RuleDefinition };
