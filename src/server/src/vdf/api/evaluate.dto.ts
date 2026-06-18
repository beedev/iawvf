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
  @ApiPropertyOptional({
    nullable: true,
    description:
      'The key of the rule that produced this outcome (e.g. "PM17"), or null if it ' +
      'could not be attributed. Enrichment only — the engine is unchanged.',
  })
  ruleKey!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'The human-readable name of the producing rule (e.g. "Circled H&E required ' +
      'for Technical FISH on FFPE"), or null when unknown.',
  })
  ruleName!: string | null;

  static from(
    o: Outcome,
    ruleKey: string | null = null,
    ruleName: string | null = null,
  ): OutcomeDto {
    return {
      type: o.type,
      group: groupFor(o.type),
      scope: o.scope ?? null,
      reason: o.reason ?? null,
      severity: o.severity ?? null,
      parameters: o.parameters ?? {},
      ruleKey,
      ruleName,
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
  @ApiPropertyOptional({
    nullable: true,
    description:
      'The human-readable name of the rule keyed by ruleKey, or null when unknown.',
  })
  ruleName!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() phase!: string;
  @ApiProperty() applied!: boolean;
  @ApiPropertyOptional({ nullable: true }) assertResult!: boolean | null;
  @ApiProperty({ type: [ConditionTraceDto] })
  conditions!: ConditionTraceDto[];
  @ApiPropertyOptional({ type: OutcomeDto, nullable: true })
  produced!: OutcomeDto | null;

  static from(
    t: DecisionTrace,
    ruleNamesByKey: ReadonlyMap<string, string> = new Map(),
  ): DecisionTraceDto {
    const ruleName = ruleNamesByKey.get(t.ruleKey) ?? null;
    return {
      ruleKey: t.ruleKey,
      ruleName,
      version: t.version,
      phase: t.phase,
      applied: t.applied,
      assertResult: t.assertResult,
      conditions: t.conditions.map((c) => ConditionTraceDto.from(c)),
      produced:
        t.produced === null
          ? null
          : OutcomeDto.from(t.produced, t.ruleKey, ruleName),
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
    ruleNamesByKey: ReadonlyMap<string, string> = new Map(),
  ): EvaluateResponseDto {
    // Attribute each produced outcome to its originating rule. The engine pushes the SAME
    // Outcome object into both `outcomes` and the producing trace entry's `produced` field
    // (in lockstep), so we correlate by object identity — robust to ordering. An ordered
    // queue of unmatched produced-trace entries is the fallback when identity is lost (e.g.
    // a future serialization boundary that clones the outcome).
    const ruleKeyByOutcome = new Map<Outcome, string>();
    const producedRuleKeys: string[] = [];
    for (const t of result.trace) {
      if (t.produced !== null) {
        ruleKeyByOutcome.set(t.produced, t.ruleKey);
        producedRuleKeys.push(t.ruleKey);
      }
    }

    let fallbackIndex = 0;
    const outcomes = result.outcomes.map((o) => {
      const ruleKey =
        ruleKeyByOutcome.get(o) ?? producedRuleKeys[fallbackIndex] ?? null;
      fallbackIndex += 1;
      const ruleName =
        ruleKey === null ? null : (ruleNamesByKey.get(ruleKey) ?? null);
      return OutcomeDto.from(o, ruleKey, ruleName);
    });

    return {
      outcomes,
      factsAfter: result.factsAfter ?? null,
      trace: result.trace.map((t) => DecisionTraceDto.from(t, ruleNamesByKey)),
      validation: ValidationBlockDto.from(validation),
    };
  }
}
