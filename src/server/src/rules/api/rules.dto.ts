import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';
import { ActiveVersionMetadata } from '../rule.repository';
import { RuleDefinition } from '../../vdf/types';

/** A summary view of a stored rule for list / get responses (mirrors `RuleSummaryDto`). */
export class RuleSummaryDto {
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) ruleSet!: string | null;
  @ApiProperty() phase!: string;
  @ApiProperty() priority!: number;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty() effectiveDate!: string;
  @ApiPropertyOptional({ nullable: true }) expiryDate!: string | null;

  static from(r: RuleDefinition): RuleSummaryDto {
    return {
      key: r.key,
      name: r.name,
      description: r.description ?? null,
      ruleSet: r.ruleSet ?? null,
      phase: r.phase,
      priority: r.priority,
      enabled: r.enabled,
      version: r.version,
      effectiveDate: r.effectiveDate,
      expiryDate: r.expiryDate ?? null,
    };
  }
}

/** The full rule view: summary + raw rule JSON + governance metadata. */
export class RuleDetailDto {
  @ApiProperty({ type: RuleSummaryDto }) summary!: RuleSummaryDto;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  ruleJson!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true }) authoredBy!: string | null;
  @ApiPropertyOptional({ nullable: true }) authorNl!: string | null;
  @ApiPropertyOptional({ nullable: true }) interpreterVersion!: string | null;
  @ApiPropertyOptional({ nullable: true }) approvedBy!: string | null;
  @ApiPropertyOptional({ nullable: true }) approvedAt!: string | null;

  static from(
    rule: RuleDefinition,
    meta: ActiveVersionMetadata | null,
  ): RuleDetailDto {
    return {
      summary: RuleSummaryDto.from(rule),
      ruleJson: rule as unknown as Record<string, unknown>,
      authoredBy: meta?.authoredBy ?? null,
      authorNl: meta?.authorNl ?? null,
      interpreterVersion: meta?.interpreterVersion ?? null,
      approvedBy: meta?.approvedBy ?? null,
      approvedAt: meta?.approvedAt?.toISOString() ?? null,
    };
  }
}

/** Request to create / save a rule, carrying optional authoring provenance. */
export class CreateRuleRequestDto {
  @ApiProperty({
    description: 'The rule definition as a JSON object.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  ruleJson!: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  authorNl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  interpreterVersion?: string | null;
}

/** Request to add a new effective-dated version of an existing rule. */
export class AddVersionRequestDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  ruleJson!: Record<string, unknown>;

  @ApiProperty({ description: 'The inclusive effective date (ISO-8601).' })
  @IsISO8601()
  effectiveDate!: string;
}

/** Request to approve the active version of a rule. */
export class ApproveRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional display-only approver hint. The persisted audit identity is always ' +
      'the authenticated principal, never this field.',
  })
  @IsOptional()
  @IsString()
  approver?: string;
}

/** The response to a governance mutation (mirrors `RuleMutationResponse`). */
export class RuleMutationResponseDto {
  @ApiProperty() key!: string;
  @ApiPropertyOptional({ nullable: true }) version!: number | null;
  @ApiProperty() message!: string;
}
