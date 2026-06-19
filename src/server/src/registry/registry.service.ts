import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Entity,
  Field,
  FieldDataType,
  Prisma,
  RegistryStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ENTITY_KEY_PATTERN,
  FIELD_DATA_TYPES,
  FIELD_NAME_PATTERN,
} from './registry.constants';
import { canonicalizeKey, humanizeLabel } from './registry.naming';

/** An entity together with its fields (the standard listing projection). */
export type EntityWithFields = Entity & { fields: Field[] };

/** Inputs for creating an entity. */
export interface CreateEntityInput {
  key: string;
  label?: string;
  description?: string;
  createdBy: string;
}

/** Inputs for adding a field to an existing entity. */
export interface AddFieldInput {
  name: string;
  dataType: FieldDataType;
  required?: boolean;
  allowedValues?: string[];
  description?: string;
  /**
   * Override the near-duplicate guard. When false/omitted, adding a field whose name is a
   * token-subset of (or near-identical to) an existing field is REJECTED to stop synonym
   * accumulation (e.g. `performingLabRouting` beside `performingLab`). Set true to add anyway.
   */
  allowOverlap?: boolean;
}

/**
 * Governed CRUD over the entity registry.
 *
 * Invariants enforced here (not by callers):
 *  - Entity keys are case-insensitively unique. The canonical lower-case form is
 *    stored AND uniquely indexed, so "Kit" then "kit" is rejected with 409.
 *  - Fields are added only by SELECTING an existing entity — never by typing a
 *    free path. addField on a missing entity is a 404, not an implicit create.
 *  - Deprecation is reversible-by-status (kept resolvable); retirement is a hard
 *    delete gated on Deprecated + zero references.
 *
 * On every mutation the schema-validator cache is invalidated via the supplied
 * callback so runtime validation always reflects the live registry.
 */
@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);
  private onChange: (() => void) | undefined;

  constructor(private readonly prisma: PrismaService) {}

  /** Registers a cache-invalidation hook fired after each successful mutation. */
  registerChangeListener(listener: () => void): void {
    this.onChange = listener;
  }

  private notifyChanged(): void {
    this.onChange?.();
  }

  /** Lists all entities (any status) with their fields, key-ordered. */
  listEntities(): Promise<EntityWithFields[]> {
    return this.prisma.entity.findMany({
      include: { fields: { orderBy: { name: 'asc' } } },
      orderBy: { key: 'asc' },
    });
  }

  /** Fetches one entity (with fields) by canonical key, or throws 404. */
  async getEntityOrThrow(key: string): Promise<EntityWithFields> {
    const canonical = canonicalizeKey(key);
    const entity = await this.prisma.entity.findUnique({
      where: { key: canonical },
      include: { fields: { orderBy: { name: 'asc' } } },
    });
    if (!entity) {
      throw new NotFoundException(`Entity '${canonical}' does not exist.`);
    }
    return entity;
  }

  /**
   * Creates an entity. Validates the key pattern, canonicalises to lower-case,
   * and rejects a case-insensitive duplicate with 409. Derives the label from
   * the original (camelCase) key when none is supplied.
   */
  async createEntity(input: CreateEntityInput): Promise<EntityWithFields> {
    const trimmedKey = input.key.trim();
    if (!ENTITY_KEY_PATTERN.test(trimmedKey)) {
      throw new BadRequestException(
        'Entity key must match /^[a-zA-Z][a-zA-Z0-9]*$/ (a single identifier segment).',
      );
    }

    const canonical = canonicalizeKey(trimmedKey);
    const label = input.label?.trim() || humanizeLabel(trimmedKey);

    try {
      const entity = await this.prisma.entity.create({
        data: {
          key: canonical,
          label,
          description: input.description?.trim() || null,
          status: RegistryStatus.Active,
          createdBy: input.createdBy,
        },
        include: { fields: true },
      });
      this.logger.log(`Entity created: '${canonical}' by ${input.createdBy}.`);
      this.notifyChanged();
      return entity;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `An entity with key '${canonical}' already exists (keys are case-insensitive).`,
        );
      }
      throw error;
    }
  }

  /**
   * Adds a field to an EXISTING entity. The entity must already exist (selected,
   * not typed) — otherwise 404. Validates the name pattern and data type, and
   * enforces uniqueness of the field name within the entity (409 on duplicate).
   */
  async addField(
    entityKey: string,
    input: AddFieldInput,
    actor: string,
  ): Promise<Field> {
    const entity = await this.getEntityOrThrow(entityKey);

    const name = input.name.trim();
    if (!FIELD_NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        'Field name must be dot-separated identifier segments with an optional trailing "[]".',
      );
    }
    if (!FIELD_DATA_TYPES.includes(input.dataType)) {
      throw new BadRequestException(
        `dataType must be one of: ${FIELD_DATA_TYPES.join(', ')}.`,
      );
    }

    // Near-duplicate guard: a new field that is a token-subset of (or near-identical to) an
    // existing ACTIVE field is almost always a synonym (e.g. `performingLabRouting` beside
    // `performingLab`). Reject it so the registry doesn't re-accumulate the duplicates that
    // make later interpretations ground onto junk. Authors who really mean it pass allowOverlap.
    if (input.allowOverlap !== true) {
      const collisions = findNearDuplicateFields(name, entity.fields);
      if (collisions.length > 0) {
        const list = collisions.map((c) => `'${entity.key}.${c}'`).join(', ');
        throw new ConflictException(
          `Field '${name}' looks like a duplicate of existing field(s) ${list} on '${entity.key}'. ` +
            'Reuse the existing field, or resubmit with allowOverlap=true to add it anyway.',
        );
      }
    }

    const allowedValues = this.normalizeAllowedValues(input.allowedValues);

    try {
      const field = await this.prisma.field.create({
        data: {
          entityId: entity.id,
          name,
          dataType: input.dataType,
          required: input.required ?? false,
          allowedValues,
          description: input.description?.trim() || null,
          status: RegistryStatus.Active,
        },
      });
      this.logger.log(
        `Field added: '${entity.key}.${name}' (${input.dataType}) by ${actor}.`,
      );
      this.notifyChanged();
      return field;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Field '${name}' already exists on entity '${entity.key}'.`,
        );
      }
      throw error;
    }
  }

  /** Deprecates an entity (kept resolvable so live rules don't break). */
  async deprecateEntity(key: string): Promise<EntityWithFields> {
    const entity = await this.getEntityOrThrow(key);
    const updated = await this.prisma.entity.update({
      where: { id: entity.id },
      data: { status: RegistryStatus.Deprecated },
      include: { fields: { orderBy: { name: 'asc' } } },
    });
    this.logger.log(`Entity deprecated: '${entity.key}'.`);
    this.notifyChanged();
    return updated;
  }

  /** Deprecates a single field on an entity (kept resolvable). */
  async deprecateField(entityKey: string, name: string): Promise<Field> {
    const field = await this.getFieldOrThrow(entityKey, name);
    const updated = await this.prisma.field.update({
      where: { id: field.id },
      data: { status: RegistryStatus.Deprecated },
    });
    this.logger.log(
      `Field deprecated: '${canonicalizeKey(entityKey)}.${name}'.`,
    );
    this.notifyChanged();
    return updated;
  }

  /**
   * Retires (hard-deletes) an entity. Permitted only when the entity is already
   * Deprecated AND has zero references. Reference counting is a stub returning 0
   * until the rules module (N3) wires real impact analysis.
   */
  async retireEntity(key: string): Promise<void> {
    const entity = await this.getEntityOrThrow(key);
    this.assertRetirable(
      entity.status,
      `entity '${entity.key}'`,
      this.countEntityReferences(entity.key),
    );
    await this.prisma.entity.delete({ where: { id: entity.id } });
    this.logger.log(`Entity retired: '${entity.key}'.`);
    this.notifyChanged();
  }

  /** Retires (hard-deletes) a field. Same gates as entity retirement. */
  async retireField(entityKey: string, name: string): Promise<void> {
    const field = await this.getFieldOrThrow(entityKey, name);
    const canonical = canonicalizeKey(entityKey);
    this.assertRetirable(
      field.status,
      `field '${canonical}.${name}'`,
      this.countFieldReferences(canonical, name),
    );
    await this.prisma.field.delete({ where: { id: field.id } });
    this.logger.log(`Field retired: '${canonical}.${name}'.`);
    this.notifyChanged();
  }

  /**
   * Flat list of canonical subject paths (`${key}.${field.name}`) for all Active
   * fields on Active entities. This is the projection the vocabulary and engine
   * grounding consume.
   */
  async getSubjectPaths(): Promise<string[]> {
    const entities = await this.prisma.entity.findMany({
      where: { status: RegistryStatus.Active },
      include: {
        fields: { where: { status: RegistryStatus.Active } },
      },
      orderBy: { key: 'asc' },
    });
    return entities
      .flatMap((entity) =>
        entity.fields.map((field) => `${entity.key}.${field.name}`),
      )
      .sort((a, b) => a.localeCompare(b));
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async getFieldOrThrow(
    entityKey: string,
    name: string,
  ): Promise<Field> {
    const entity = await this.getEntityOrThrow(entityKey);
    const field = entity.fields.find((f) => f.name === name);
    if (!field) {
      throw new NotFoundException(
        `Field '${name}' does not exist on entity '${entity.key}'.`,
      );
    }
    return field;
  }

  private normalizeAllowedValues(values: string[] | undefined): string[] {
    if (!values) {
      return [];
    }
    const cleaned = values.map((v) => v.trim()).filter((v) => v.length > 0);
    return Array.from(new Set(cleaned));
  }

  private assertRetirable(
    status: RegistryStatus,
    subject: string,
    references: number,
  ): void {
    if (status !== RegistryStatus.Deprecated) {
      throw new UnprocessableEntityException(
        `Cannot retire ${subject}: it must be Deprecated first.`,
      );
    }
    if (references > 0) {
      throw new ConflictException(
        `Cannot retire ${subject}: it is referenced by ${references} rule(s).`,
      );
    }
  }

  /**
   * Reference-count seam. Rules live in a later module (N3); until then nothing
   * references registry artifacts, so these return 0. Kept as instance methods
   * (taking the target identity) so N3 can replace the body with real impact
   * analysis without changing the retirement gates or their callers.
   */
  private countEntityReferences(entityKey: string): number {
    void entityKey;
    return 0;
  }

  private countFieldReferences(entityKey: string, fieldName: string): number {
    void entityKey;
    void fieldName;
    return 0;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

/**
 * Splits a single path SEGMENT into lower-case word tokens, breaking on camelCase
 * boundaries and separators. `performingLabRouting` → ['performing','lab','routing'].
 */
function tokenizeSegment(segment: string): string[] {
  return segment
    .replace(/\[\]$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
}

/** Splits a dotted field name into its parent prefix and final segment. */
function splitFieldPath(name: string): { parent: string; leaf: string } {
  const clean = name.replace(/\[\]$/, '');
  const dot = clean.lastIndexOf('.');
  return dot < 0
    ? { parent: '', leaf: clean }
    : { parent: clean.slice(0, dot), leaf: clean.slice(dot + 1) };
}

/**
 * Finds existing ACTIVE fields that a proposed `name` is a near-duplicate of — the signal
 * the add-field guard uses to stop SYNONYM accumulation (e.g. `performingLabRouting` beside
 * `performingLab`).
 *
 * Comparison is PREFIX-AWARE so legitimate nesting is never flagged: only fields sharing the
 * SAME dotted parent are compared, on their final segment's tokens. A collision is then either
 *  - a token-SUBSET on the leaf (`performingLab` ⊂ `performingLabRouting`), or
 *  - high leaf-token overlap (Jaccard ≥ 0.6).
 * This leaves parent/child pairs (`specimen` vs `specimen.type`) and same-parent siblings with
 * distinct meaning (`client.nyStatus` vs `client.program`) addable. Exact-name matches are left
 * to the unique constraint (a clearer, separate error).
 */
export function findNearDuplicateFields(
  name: string,
  existing: readonly Field[],
): string[] {
  const a = splitFieldPath(name);
  const aTokens = tokenizeSegment(a.leaf);
  if (aTokens.length === 0) {
    return [];
  }
  const aSet = new Set(aTokens);
  const hits: string[] = [];
  for (const field of existing) {
    if (field.status !== RegistryStatus.Active || field.name === name) {
      continue; // inactive, or exact dup (handled by the unique constraint)
    }
    const b = splitFieldPath(field.name);
    if (b.parent !== a.parent) {
      continue; // different nesting context — not a synonym
    }
    const bSet = new Set(tokenizeSegment(b.leaf));
    if (bSet.size === 0) {
      continue;
    }
    const shared = [...aSet].filter((t) => bSet.has(t)).length;
    if (shared === 0) {
      continue;
    }
    const subset = shared === aSet.size || shared === bSet.size;
    const jaccard = shared / (aSet.size + bSet.size - shared);
    if (subset || jaccard >= 0.6) {
      hits.push(field.name);
    }
  }
  return hits;
}
