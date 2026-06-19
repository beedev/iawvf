import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/roles.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AddFieldDto } from './dto/add-field.dto';
import { CreateEntityDto } from './dto/create-entity.dto';
import { ValidateFactsDto } from './dto/validate-facts.dto';
import {
  FactValidationResult,
  FactValidationService,
} from './fact-validation.service';
import { EntityWithFields, RegistryService } from './registry.service';

/** Vocabulary projection: Active entities -> their Active fields. */
interface VocabularyProperty {
  path: string;
  name: string;
  dataType: string;
  status: string;
  allowedValues: string[];
}

interface VocabularyObject {
  key: string;
  label: string;
  status: string;
  properties: VocabularyProperty[];
}

/**
 * Admin/authoring surface for the entity registry.
 *
 *   GET    /api/registry/entities                              any authenticated
 *   POST   /api/registry/entities                              Admin
 *   POST   /api/registry/entities/:key/fields                  Admin
 *   POST   /api/registry/entities/:key/deprecate               Admin
 *   POST   /api/registry/entities/:key/fields/:name/deprecate  Admin
 *   DELETE /api/registry/entities/:key                         Admin (retire)
 *   DELETE /api/registry/entities/:key/fields/:name            Admin (retire)
 *   POST   /api/registry/validate                              any authenticated
 *   GET    /api/registry/vocabulary                            any authenticated
 *
 * Mutations are audited (actor + target, never PHI).
 */
@ApiTags('registry')
@ApiBearerAuth()
@Controller('api/registry')
export class RegistryController {
  constructor(
    private readonly registry: RegistryService,
    private readonly validator: FactValidationService,
  ) {}

  @Get('entities')
  @ApiOperation({
    summary: 'List all entities (any status) with their fields.',
  })
  listEntities(): Promise<EntityWithFields[]> {
    return this.registry.listEntities();
  }

  @Post('entities')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an entity (409 on case-insensitive duplicate key).',
  })
  createEntity(
    @Body() dto: CreateEntityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EntityWithFields> {
    return this.registry.createEntity({
      key: dto.key,
      label: dto.label,
      description: dto.description,
      createdBy: user.username,
    });
  }

  @Post('entities/:key/fields')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a field to an existing entity.' })
  @ApiParam({ name: 'key' })
  addField(
    @Param('key') key: string,
    @Body() dto: AddFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registry.addField(
      key,
      {
        name: dto.name,
        dataType: dto.dataType,
        required: dto.required,
        allowedValues: dto.allowedValues,
        description: dto.description,
        allowOverlap: dto.allowOverlap,
      },
      user.username,
    );
  }

  @Post('entities/:key/deprecate')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deprecate an entity (kept resolvable).' })
  @ApiParam({ name: 'key' })
  deprecateEntity(@Param('key') key: string): Promise<EntityWithFields> {
    return this.registry.deprecateEntity(key);
  }

  @Post('entities/:key/fields/:name/deprecate')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deprecate a field (kept resolvable).' })
  @ApiParam({ name: 'key' })
  @ApiParam({ name: 'name' })
  deprecateField(@Param('key') key: string, @Param('name') name: string) {
    return this.registry.deprecateField(key, name);
  }

  @Delete('entities/:key')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retire an entity (must be Deprecated and unreferenced).',
  })
  @ApiParam({ name: 'key' })
  retireEntity(@Param('key') key: string): Promise<void> {
    return this.registry.retireEntity(key);
  }

  @Delete('entities/:key/fields/:name')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retire a field (must be Deprecated and unreferenced).',
  })
  @ApiParam({ name: 'key' })
  @ApiParam({ name: 'name' })
  retireField(
    @Param('key') key: string,
    @Param('name') name: string,
  ): Promise<void> {
    return this.registry.retireField(key, name);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a fact document against the entity registry.',
  })
  validate(@Body() dto: ValidateFactsDto): Promise<FactValidationResult> {
    return this.validator.validateFacts(dto.facts);
  }

  @Get('vocabulary')
  @ApiOperation({
    summary: 'Active entities/fields projection used by authoring & grounding.',
  })
  async vocabulary(): Promise<{ objects: VocabularyObject[] }> {
    const entities = await this.registry.listEntities();
    const objects = entities
      .filter((entity) => entity.status === 'Active')
      .map<VocabularyObject>((entity) => ({
        key: entity.key,
        label: entity.label,
        status: entity.status,
        properties: entity.fields
          .filter((field) => field.status === 'Active')
          .map((field) => ({
            path: `${entity.key}.${field.name}`,
            name: field.name,
            dataType: field.dataType,
            status: field.status,
            allowedValues: field.allowedValues,
          })),
      }));
    return { objects };
  }
}
