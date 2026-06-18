import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/roles.enum';
import { VocabularyProjectionService } from '../../rules/vocabulary-projection.service';
import { parseRuleJson } from '../../vdf/api/rule-json.helper';
import { AuthoringService } from '../authoring.service';
import { RuleInterpreterService } from '../llm/rule-interpreter.service';
import {
  DryRunResponseDto,
  InterpretRequestDto,
  InterpretResponseDto,
  LintReportDto,
  ParaphraseResponseDto,
  RuleJsonRequestDto,
  VocabularyResponseDto,
} from './authoring.dto';

/**
 * Authoring tools: vocabulary tree, natural-language interpretation, registry-grounded
 * linting, deterministic paraphrasing, and corpus dry-run preview. These are read-only
 * / non-persisting — they help an author shape a rule before it is saved via the rules
 * controller.
 *
 * The vocabulary tree is readable by any authenticated principal (the scope-picker
 * source). The mutating authoring actions require the Author role; per-action @Roles
 * keeps the vocabulary read open while gating the rest.
 */
@ApiTags('authoring')
@ApiBearerAuth()
@Controller('api/authoring')
export class AuthoringController {
  private readonly logger = new Logger(AuthoringController.name);

  constructor(
    private readonly authoring: AuthoringService,
    private readonly interpreter: RuleInterpreterService,
    private readonly vocabulary: VocabularyProjectionService,
  ) {}

  @Get('vocabulary')
  @ApiOperation({
    summary:
      'The controlled vocabulary as an object -> property tree (Active only), plus ' +
      'operator and outcome names. The authoring scope-picker source.',
  })
  @ApiResponse({ status: 200, type: VocabularyResponseDto })
  async vocabularyTree(): Promise<VocabularyResponseDto> {
    const tree = await this.vocabulary.projectTree();
    return VocabularyResponseDto.from(tree);
  }

  @Post('interpret')
  @Roles(Role.Author)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Interpret a natural-language rule into a candidate rule definition, grounded ' +
      'on the (optionally scoped) registry vocabulary.',
  })
  @ApiResponse({ status: 200, type: InterpretResponseDto })
  @ApiResponse({ status: 400, description: 'Unknown vocabulary scope.' })
  @ApiResponse({ status: 503, description: 'The interpreter is unavailable.' })
  async interpret(
    @Body() request: InterpretRequestDto,
  ): Promise<InterpretResponseDto> {
    // Resolve the SCOPED grounding subjects from the registry projection. An unknown
    // object/property is a 400 (the UI can never silently scope to nothing) — mirrors
    // the .NET scoped-interpret.
    const scope = await this.vocabulary.resolveScope(
      request.objects,
      request.properties,
    );
    if (!scope.ok) {
      throw new BadRequestException(scope.error ?? 'Unknown vocabulary scope.');
    }

    try {
      const result = await this.interpreter.interpretScoped(
        request.naturalLanguage,
        scope.subjects,
      );
      return InterpretResponseDto.from(result);
    } catch (error) {
      // The facade falls back to the offline stub on a live failure, so reaching here
      // means the grounding itself was unavailable. Degrade to 503 — never a 500 that
      // could leak provider/config detail.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Interpreter unavailable: ${message}`);
      throw new ServiceUnavailableException(
        'The rule interpreter is currently unavailable. Contact your administrator if this persists.',
      );
    }
  }

  @Post('lint')
  @Roles(Role.Author)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lint a rule JSON object against the live registry vocabulary.',
  })
  @ApiResponse({ status: 200, type: LintReportDto })
  async lint(@Body() request: RuleJsonRequestDto): Promise<LintReportDto> {
    const rule = parseRuleJson(request.ruleJson);
    const report = await this.authoring.lint(rule);
    return LintReportDto.from(report);
  }

  @Post('paraphrase')
  @Roles(Role.Author)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Produce a deterministic English paraphrase of a rule.',
  })
  @ApiResponse({ status: 200, type: ParaphraseResponseDto })
  paraphrase(@Body() request: RuleJsonRequestDto): ParaphraseResponseDto {
    const rule = parseRuleJson(request.ruleJson);
    return { paraphrase: this.authoring.paraphrase(rule) };
  }

  @Post('dry-run')
  @Roles(Role.Author)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Dry-run a candidate rule against the repo fixtures corpus (no side effects).',
  })
  @ApiResponse({ status: 200, type: DryRunResponseDto })
  async dryRun(
    @Body() request: RuleJsonRequestDto,
  ): Promise<DryRunResponseDto> {
    const rule = parseRuleJson(request.ruleJson);
    const result = await this.authoring.previewFromRepoFixtures(rule);
    return DryRunResponseDto.from(result);
  }
}
