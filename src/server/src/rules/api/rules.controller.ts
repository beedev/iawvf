import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/roles.enum';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AuthoringService } from '../../authoring/authoring.service';
import { parseRuleJson } from '../../vdf/api/rule-json.helper';
import { LintReportDto } from '../../authoring/api/authoring.dto';
import { RuleDefinition } from '../../vdf/types';
import { RuleRepository } from '../rule.repository';
import {
  AddVersionRequestDto,
  ApproveRequestDto,
  CreateRuleRequestDto,
  RuleDetailDto,
  RuleMutationResponseDto,
  RuleSummaryDto,
} from './rules.dto';

/**
 * The governed rule repository (backed by Postgres). Reads are open to any
 * authenticated principal; mutations are gated by role: authoring (create / new
 * version) requires Author, approval requires Reviewer, and promote / disable require
 * Admin. Every mutation is audited via structured logs (who / what / when) with no PHI.
 */
@ApiTags('rules')
@ApiBearerAuth()
@Controller('api/rules')
export class RulesController {
  private readonly logger = new Logger(RulesController.name);

  constructor(
    private readonly repository: RuleRepository,
    private readonly authoring: AuthoringService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List active rules at an optional point in time, optionally by rule set.',
  })
  @ApiQuery({ name: 'asOf', required: false })
  @ApiQuery({ name: 'ruleSet', required: false })
  @ApiResponse({ status: 200, type: [RuleSummaryDto] })
  async list(
    @Query('asOf') asOf?: string,
    @Query('ruleSet') ruleSet?: string,
  ): Promise<RuleSummaryDto[]> {
    const at = asOf !== undefined ? new Date(asOf) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('asOf is not a valid ISO-8601 date.');
    }
    const rules = await this.repository.getActiveRulesAsync(at, ruleSet);
    return rules.map((r) => RuleSummaryDto.from(r));
  }

  @Get(':key')
  @ApiOperation({ summary: 'Return a single rule (active version) by key.' })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 200, type: RuleDetailDto })
  @ApiResponse({ status: 404, description: 'The rule was not found.' })
  async getByKey(@Param('key') key: string): Promise<RuleDetailDto> {
    const rule = await this.repository.getByKey(key);
    if (rule === null) {
      throw new NotFoundException(`Rule '${key}' was not found.`);
    }
    const meta = await this.repository.getActiveVersionMetadata(key);
    return RuleDetailDto.from(rule, meta);
  }

  @Post()
  @Roles(Role.Author)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create / save a rule (Author). Lints first; rejects 422 on lint errors.',
  })
  @ApiResponse({ status: 201, type: RuleMutationResponseDto })
  @ApiResponse({
    status: 422,
    type: LintReportDto,
    description: 'Lint errors.',
  })
  async create(
    @Body() request: CreateRuleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleMutationResponseDto> {
    const rule = parseRuleJson(request.ruleJson);

    // Validation gate: lint against the live registry and reject on any error.
    const report = await this.authoring.lint(rule);
    if (!report.isValid) {
      this.logger.warn(
        `Rejected save of rule '${rule.key}' by ${user.username}: ` +
          `${report.findings.filter((f) => f.severity === 'Error').length} lint error(s).`,
      );
      throw new UnprocessableEntityException(LintReportDto.from(report));
    }

    const version = await this.repository.saveAsync(rule, {
      authoredBy: user.username,
      ...(request.authorNl != null ? { authorNl: request.authorNl } : {}),
      ...(request.interpreterVersion != null
        ? { interpreterVersion: request.interpreterVersion }
        : {}),
    });

    this.logger.log(
      `Rule '${rule.key}' v${version} saved by ${user.username} ` +
        `(interpreter=${request.interpreterVersion ?? '(none)'}).`,
    );
    return {
      key: rule.key,
      version,
      message: `Rule '${rule.key}' saved as version ${version}.`,
    };
  }

  @Post(':key/versions')
  @Roles(Role.Author)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Add a new effective-dated version of an existing rule (Author). Lints first.',
  })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 201, type: RuleMutationResponseDto })
  @ApiResponse({
    status: 422,
    type: LintReportDto,
    description: 'Lint errors.',
  })
  async addVersion(
    @Param('key') key: string,
    @Body() request: AddVersionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleMutationResponseDto> {
    const parsed = parseRuleJson(request.ruleJson);
    if (parsed.key !== key) {
      throw new BadRequestException(
        `ruleJson key '${parsed.key}' does not match route key '${key}'.`,
      );
    }

    const report = await this.authoring.lint(parsed);
    if (!report.isValid) {
      throw new UnprocessableEntityException(LintReportDto.from(report));
    }

    // Carry the supplied effective date onto the persisted version.
    const rule: RuleDefinition = {
      ...parsed,
      effectiveDate: new Date(request.effectiveDate).toISOString(),
    };

    const version = await this.repository.saveAsync(rule, {
      authoredBy: user.username,
    });

    this.logger.log(
      `Rule '${key}' v${version} (effective ${rule.effectiveDate}) added by ${user.username}.`,
    );
    return {
      key,
      version,
      message: `Rule '${key}' version ${version} added, effective ${rule.effectiveDate}.`,
    };
  }

  @Post(':key/approve')
  @Roles(Role.Reviewer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve the active version of a rule (Reviewer). The approver is the ' +
      'authenticated principal, never the request body.',
  })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 200, type: RuleMutationResponseDto })
  @ApiResponse({ status: 404, description: 'No active version to approve.' })
  async approve(
    @Param('key') key: string,
    @Body() _request: ApproveRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleMutationResponseDto> {
    // Audit integrity: the approval identity is the AUTHENTICATED principal, never the
    // caller-supplied body (request.approver is a display hint only).
    const { status, version } = await this.repository.approve(
      key,
      user.username,
    );
    if (status !== 'Succeeded') {
      throw new NotFoundException(
        `Rule '${key}' has no active version to approve.`,
      );
    }

    this.logger.log(`Rule '${key}' v${version} approved by ${user.username}.`);
    return {
      key,
      version,
      message: `Rule '${key}' version ${version} approved.`,
    };
  }

  @Post(':key/promote')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote (enable) a rule (Admin).' })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 200, type: RuleMutationResponseDto })
  @ApiResponse({ status: 404, description: 'The rule was not found.' })
  promote(
    @Param('key') key: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleMutationResponseDto> {
    return this.setEnabled(key, true, 'promoted', user);
  }

  @Post(':key/disable')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Disable a rule (Admin). Disabled rules are excluded from evaluation.',
  })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 200, type: RuleMutationResponseDto })
  @ApiResponse({ status: 404, description: 'The rule was not found.' })
  disable(
    @Param('key') key: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleMutationResponseDto> {
    return this.setEnabled(key, false, 'disabled', user);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async setEnabled(
    key: string,
    enabled: boolean,
    action: string,
    user: AuthenticatedUser,
  ): Promise<RuleMutationResponseDto> {
    const status = await this.repository.setEnabled(key, enabled);
    if (status === 'RuleNotFound') {
      throw new NotFoundException(`Rule '${key}' was not found.`);
    }
    this.logger.log(`Rule '${key}' ${action} by ${user.username}.`);
    return { key, version: null, message: `Rule '${key}' ${action}.` };
  }
}
