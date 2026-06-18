import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ConditionTrace,
  DecisionTrace,
  EvaluationResult,
  groupFor,
  Outcome,
} from '../types';
import { FactValidationResult } from '../../registry/fact-validation.service';

/** The three engine trigger types (mirrors the .NET `TriggerType`). */
export const TRIGGER_TYPES = [
  'OrderEvent',
  'TimeSchedule',
  'DecisionReturned',
] as const;
export type TriggerTypeName = (typeof TRIGGER_TYPES)[number];

/** Request to evaluate a facts document against the active rule set. */
export class EvaluateRequestDto {
  @ApiProperty({
    description: 'The facts to evaluate. Must be a JSON object.',
    type: 'object',
    additionalProperties: true,
    example: {
      test: { code: 'FISH-T-001', specimen: { type: 'FFPE' } },
      specimen: { type: 'FFPE', fixationTime: 24 },
      order: { client: { nyStatus: 'Standard' } },
    },
  })
  @IsObject()
  factsJson!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Optional rule-set filter; when omitted, all active rules apply.',
  })
  @IsOptional()
  @IsString()
  ruleSet?: string;

  @ApiPropertyOptional({
    description: 'Optional trigger type. Defaults to OrderEvent.',
    enum: TRIGGER_TYPES,
  })
  @IsOptional()
  @IsIn(TRIGGER_TYPES)
  triggerType?: TriggerTypeName;

  @ApiPropertyOptional({
    description:
      'When true, a registry validation failure blocks evaluation (422). ' +
      'Default false: outcomes are returned alongside a validation block so the UI ' +
      'can surface mismatches without losing the decision.',
  })
  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}

/** An outcome projected for the API response (mirrors the .NET `OutcomeDto`). */
export class OutcomeDto {
  @ApiProperty() type!: string;
  @ApiProperty() group!: string;
  @ApiPropertyOptional({ nullable: true }) scope!: string | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) severity!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  parameters!: Record<string, unknown>;

  static from(o: Outcome): OutcomeDto {
    return {
      type: o.type,
      group: groupFor(o.type),
      scope: o.scope ?? null,
      reason: o.reason ?? null,
      severity: o.severity ?? null,
      parameters: o.parameters ?? {},
    };
  }
}

/** A single leaf-condition trace projected for the API response. */
export class ConditionTraceDto {
  @ApiProperty() subject!: string;
  @ApiProperty() operator!: string;
  @ApiPropertyOptional({ nullable: true }) resolvedLeft!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolvedRight!: string | null;
  @ApiProperty() result!: boolean;

  static from(c: ConditionTrace): ConditionTraceDto {
    return {
      subject: c.subject,
      operator: c.operator,
      resolvedLeft: c.resolvedLeft,
      resolvedRight: c.resolvedRight,
      result: c.result,
    };
  }
}

/** A per-rule decision trace projected for the API response. */
export class DecisionTraceDto {
  @ApiProperty() ruleKey!: string;
  @ApiProperty() version!: number;
  @ApiProperty() phase!: string;
  @ApiProperty() applied!: boolean;
  @ApiPropertyOptional({ nullable: true }) assertResult!: boolean | null;
  @ApiProperty({ type: [ConditionTraceDto] })
  conditions!: ConditionTraceDto[];
  @ApiPropertyOptional({ type: OutcomeDto, nullable: true })
  produced!: OutcomeDto | null;

  static from(t: DecisionTrace): DecisionTraceDto {
    return {
      ruleKey: t.ruleKey,
      version: t.version,
      phase: t.phase,
      applied: t.applied,
      assertResult: t.assertResult,
      conditions: t.conditions.map((c) => ConditionTraceDto.from(c)),
      produced: t.produced === null ? null : OutcomeDto.from(t.produced),
    };
  }
}

/** A single registry validation error (entity-/path-scoped, no PHI). */
export class ValidationErrorDto {
  @ApiProperty() entity!: string;
  @ApiProperty() path!: string;
  @ApiProperty() message!: string;
}

/** The registry validation block attached to an evaluation (N6 addition). */
export class ValidationBlockDto {
  @ApiProperty({
    description: 'True when no registry validation errors were found.',
  })
  valid!: boolean;
  @ApiProperty({ type: [ValidationErrorDto] })
  errors!: ValidationErrorDto[];

  static from(r: FactValidationResult): ValidationBlockDto {
    return { valid: r.valid, errors: r.errors };
  }
}

/**
 * The evaluation response: outcomes, the full per-rule trace, the post-run facts, and
 * the registry validation block. The first three keys match the .NET `EvaluateResponse`
 * and the React UI's `EvaluateResponse` exactly; `validation` is an additive block the
 * UI can read to surface fact/registry mismatches (the UI tolerates unknown keys).
 */
export class EvaluateResponseDto {
  @ApiProperty({ type: [OutcomeDto] })
  outcomes!: OutcomeDto[];
  @ApiProperty({ type: [DecisionTraceDto] })
  trace!: DecisionTraceDto[];
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  factsAfter!: Record<string, unknown> | null;
  @ApiProperty({ type: ValidationBlockDto })
  validation!: ValidationBlockDto;

  static from(
    result: EvaluationResult,
    validation: FactValidationResult,
  ): EvaluateResponseDto {
    return {
      outcomes: result.outcomes.map((o) => OutcomeDto.from(o)),
      factsAfter: result.factsAfter ?? null,
      trace: result.trace.map((t) => DecisionTraceDto.from(t)),
      validation: ValidationBlockDto.from(validation),
    };
  }
}
