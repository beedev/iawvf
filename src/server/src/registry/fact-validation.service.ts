import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RegistryStatus } from '@prisma/client';
import Ajv2020, { ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { RegistryService } from './registry.service';
import { compileEntitySchema } from './schema-compiler';

/** A single validation error, entity- and path-scoped, message-only (no PHI). */
export interface FactValidationError {
  entity: string;
  path: string;
  message: string;
}

/** Result of validating a fact document against the registry. */
export interface FactValidationResult {
  valid: boolean;
  errors: FactValidationError[];
}

/**
 * Runtime validation of fact documents against the compiled entity schemas.
 *
 * For each top-level key in a fact document that matches a known Active entity,
 * the matching sub-document is validated against that entity's compiled JSON
 * Schema. Unknown top-level keys are ignored (the registry does not own them);
 * within a known entity, type mismatches, bad enum values, and missing required
 * fields are reported, while extra unmodelled fields are tolerated (lenient).
 *
 * Compiled Ajv validators are cached and rebuilt lazily on the first validation
 * after any registry mutation (the registry service fires a change hook that
 * marks the cache stale).
 */
@Injectable()
export class FactValidationService implements OnModuleInit {
  private readonly logger = new Logger(FactValidationService.name);
  private readonly ajv: Ajv2020;
  private validators = new Map<string, ValidateFunction>();
  private stale = true;

  constructor(private readonly registry: RegistryService) {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  onModuleInit(): void {
    // Mark cache stale on every registry mutation; rebuilt lazily on next use.
    this.registry.registerChangeListener(() => {
      this.stale = true;
    });
  }

  /**
   * Validates a fact document. Lenient: only top-level keys matching a known
   * Active entity are checked; extra fields within an entity are allowed.
   */
  async validateFacts(
    factDocument: Record<string, unknown>,
  ): Promise<FactValidationResult> {
    await this.ensureCompiled();

    const errors: FactValidationError[] = [];

    for (const [entityKey, subDocument] of Object.entries(factDocument ?? {})) {
      const validate = this.validators.get(entityKey.toLowerCase());
      if (!validate) {
        // Unknown top-level key: the registry does not model it — skip.
        continue;
      }
      const ok = validate(subDocument);
      if (!ok && validate.errors) {
        for (const err of validate.errors) {
          errors.push({
            entity: entityKey,
            path: this.formatPath(entityKey, err.instancePath, err.params),
            message: err.message ?? 'is invalid',
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** (Re)compiles validators from the live registry when the cache is stale. */
  private async ensureCompiled(): Promise<void> {
    if (!this.stale) {
      return;
    }
    const entities = await this.registry.listEntities();
    const next = new Map<string, ValidateFunction>();

    for (const entity of entities) {
      if (entity.status !== RegistryStatus.Active) {
        continue;
      }
      const schema = compileEntitySchema({
        key: entity.key,
        fields: entity.fields.map((f) => ({
          name: f.name,
          dataType: f.dataType,
          required: f.required,
          allowedValues: f.allowedValues,
          status: f.status,
        })),
      });
      next.set(entity.key, this.ajv.compile(schema));
    }

    this.validators = next;
    this.stale = false;
    this.logger.log(`Compiled ${next.size} entity validator(s).`);
  }

  /**
   * Builds a stable, human-readable error path rooted at the entity. Ajv's
   * instancePath is JSON-pointer-ish ("/client/nyStatus"); we prefix the entity
   * key and dot-join. For "required" errors the missing property is appended.
   */
  private formatPath(
    entityKey: string,
    instancePath: string,
    params: Record<string, unknown>,
  ): string {
    const segments = instancePath.split('/').filter((s) => s.length > 0);
    const missing = params['missingProperty'];
    if (typeof missing === 'string') {
      segments.push(missing);
    }
    return [entityKey, ...segments].join('.');
  }
}
