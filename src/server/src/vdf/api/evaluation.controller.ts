import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { FactValidationService } from '../../registry/fact-validation.service';
import { DecisionTraceStore } from '../../rules/decision-trace.store';
import {
  RuleEvaluationService,
  EvaluateOptions,
} from '../../rules/rule-evaluation.service';
import { JsonObject } from '../types';
import { EvaluateRequestDto, EvaluateResponseDto } from './evaluate.dto';

/**
 * Evaluates a facts document against the active, Postgres-stored rule set and returns
 * the produced outcomes, the full per-rule decision trace, the post-run facts, and a
 * registry validation block. Available to any authenticated principal.
 *
 * Flow: first validate the facts against the entity registry (N1); then evaluate via
 * the engine-over-DB path (N3); then persist the decision trace (N3 audit store). By
 * default validation does NOT block — the outcomes are returned alongside the
 * validation findings so the UI can surface fact/registry mismatches. Pass
 * `strict: true` to reject (422) when the facts fail registry validation.
 */
@ApiTags('evaluate')
@ApiBearerAuth()
@Controller('api/evaluate')
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);

  constructor(
    private readonly validator: FactValidationService,
    private readonly evaluator: RuleEvaluationService,
    private readonly traceStore: DecisionTraceStore,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Validate facts against the registry, evaluate the active rule set, and ' +
      'return outcomes + trace + post-run facts + validation block.',
  })
  @ApiResponse({ status: 200, type: EvaluateResponseDto })
  @ApiResponse({
    status: 422,
    description: 'strict mode: the facts failed registry validation.',
  })
  async evaluate(
    @Body() request: EvaluateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EvaluateResponseDto> {
    const validation = await this.validator.validateFacts(request.factsJson);

    if (request.strict === true && !validation.valid) {
      // Strict mode: surface the registry findings as a 422 rather than evaluating.
      throw new UnprocessableEntityException({
        message: 'The facts failed registry validation.',
        validation,
      });
    }

    const options: EvaluateOptions = {};
    if (request.ruleSet !== undefined) {
      options.ruleSet = request.ruleSet;
    }

    const { result, ruleNamesByKey } = await this.evaluator.evaluateWithRules(
      request.factsJson as JsonObject,
      options,
    );

    // Persist the decision trace under a correlation id (audit; no PHI in the log).
    const correlationId = randomUUID();
    await this.traceStore.saveResult(result, correlationId);

    // Audit (no PHI): only counts, the rule set, and the actor — never the facts.
    this.logger.log(
      `Evaluation by ${user.username}: ruleSet=${request.ruleSet ?? '(all)'} ` +
        `outcomes=${result.outcomes.length} rulesTraced=${result.trace.length} ` +
        `validationErrors=${validation.errors.length} correlationId=${correlationId}`,
    );

    return EvaluateResponseDto.from(result, validation, ruleNamesByKey);
  }
}
