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
import { InterpretationResult } from '../llm/interpreter';
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

/** The interpreter result projected for the API response (mirrors `InterpretResponse`). */
export class InterpretResponseDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  candidate!: Record<string, unknown> | null;
  @ApiProperty() confidence!: number;
  @ApiProperty({ type: [String] }) unmappedPhrases!: string[];
  @ApiProperty({ type: [String] }) gaps!: string[];

  static from(result: InterpretationResult): InterpretResponseDto {
    return {
      candidate:
        result.candidate === null
          ? null
          : (result.candidate as unknown as Record<string, unknown>),
      confidence: result.confidence,
      unmappedPhrases: result.unmappedPhrases,
      gaps: result.gaps,
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
