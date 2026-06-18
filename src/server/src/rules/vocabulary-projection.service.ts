import { Injectable } from '@nestjs/common';
import { FieldDataType, RegistryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegistryService } from '../registry/registry.service';

/**
 * A grounded subject: a legal canonical path (`${entity.key}.${field.name}`) and its
 * data type. The data type uses the registry's {@link FieldDataType} vocabulary,
 * which is name-for-name identical to the .NET engine's SubjectDataType.
 */
export interface GroundedSubject {
  path: string;
  dataType: FieldDataType;
  /**
   * The closed set of permitted string values for this field, if the registry
   * declares one (e.g. `specimen.type`, `patient.gender`); empty when the field
   * is unconstrained. Authoring's type-aware lint (LINT020) consumes this.
   */
  allowedValues: string[];
}

/** The engine/authoring grounding vocabulary, projected from the entity registry. */
export interface GroundingVocabulary {
  /** The legal subject paths, sorted. */
  paths: string[];
  /** The legal subjects with their declared types, sorted by path. */
  subjects: GroundedSubject[];
}

/**
 * Projects the engine's grounding vocabulary FROM the entity registry (N1).
 *
 * The registry is the single source of truth: objects = entities, properties =
 * fields. There is no separate standalone vocabulary list — the legal subject paths
 * the engine and authoring ground on are exactly the Active fields on Active
 * entities. Consequently, adding a field via {@link RegistryService.addField}
 * immediately makes its path appear in the projection (next call), and deprecating
 * an entity/field removes it.
 *
 * {@link projectPaths} delegates to {@link RegistryService.getSubjectPaths} so the
 * path set is identical to the registry's own projection (the parity contract the
 * engine grounding consumes). {@link project} additionally carries each path's type.
 */
@Injectable()
export class VocabularyProjectionService {
  constructor(
    private readonly registry: RegistryService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The legal subject paths — identical to {@link RegistryService.getSubjectPaths}.
   * This IS the engine grounding set.
   */
  projectPaths(): Promise<string[]> {
    return this.registry.getSubjectPaths();
  }

  /**
   * The full grounding vocabulary: legal paths plus each path's declared data type,
   * built from Active fields on Active entities. The `paths` array is identical to
   * {@link projectPaths} (same source, same ordering).
   */
  async project(): Promise<GroundingVocabulary> {
    const entities = await this.prisma.entity.findMany({
      where: { status: RegistryStatus.Active },
      include: { fields: { where: { status: RegistryStatus.Active } } },
      orderBy: { key: 'asc' },
    });

    const subjects: GroundedSubject[] = entities
      .flatMap((entity) =>
        entity.fields.map((field) => ({
          path: `${entity.key}.${field.name}`,
          dataType: field.dataType,
          allowedValues: [...field.allowedValues],
        })),
      )
      .sort((a, b) => a.path.localeCompare(b.path));

    return {
      paths: subjects.map((s) => s.path),
      subjects,
    };
  }
}
