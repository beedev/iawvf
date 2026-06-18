import { Injectable } from '@nestjs/common';
import { FieldDataType, RegistryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegistryService } from '../registry/registry.service';
import { OPERATORS, OUTCOMES } from '../vdf/vocabulary.constants';

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

/** A single property (subject) within an object, projected for the vocabulary tree. */
export interface VocabularyTreeProperty {
  /** The full subject path (e.g. `order.client.nyStatus`). */
  path: string;
  /** The property name relative to its object (path minus the `object.` prefix). */
  name: string;
  /** The subject's data type ({@link FieldDataType} name). */
  dataType: string;
}

/** An OBJECT grouping its PROPERTIES, projected for the vocabulary tree. */
export interface VocabularyTreeObject {
  /** The object name (first path segment, e.g. `order`). */
  name: string;
  /** The Title-cased display label (e.g. `Order`). */
  label: string;
  /** The object's properties, sorted by path. */
  properties: VocabularyTreeProperty[];
}

/**
 * The controlled vocabulary as an OBJECT -> PROPERTY tree plus the flat operator and
 * outcome name lists — the exact shape the authoring UI's scope picker consumes
 * (mirrors the .NET `VocabularyTreeDto`).
 */
export interface VocabularyTree {
  objects: VocabularyTreeObject[];
  operators: string[];
  outcomes: string[];
}

/** The outcome of resolving an interpret request's optional scope to a subject subset. */
export interface ScopeResolution {
  /** True when the requested scope was valid (the subset is usable). */
  ok: boolean;
  /** The narrowed subjects (the full set when no scope was supplied). */
  subjects: GroundedSubject[];
  /** A human-readable reason when {@link ok} is false (unknown objects / properties). */
  error?: string;
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
 * {@link projectTree} groups subjects into the authoring OBJECT -> PROPERTY tree, and
 * {@link resolveScope} narrows that surface for a scoped interpret request.
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
    const subjects = await this.projectSubjects();
    return {
      paths: subjects.map((s) => s.path),
      subjects,
    };
  }

  /**
   * The authoring vocabulary tree: Active subjects grouped by object (first path
   * segment) with humanized labels, plus the engine's closed operator and outcome
   * lists. The exact shape the UI scope picker consumes.
   */
  async projectTree(): Promise<VocabularyTree> {
    const subjects = await this.projectSubjects();

    const byObject = new Map<string, VocabularyTreeProperty[]>();
    for (const subject of subjects) {
      const objectName = objectNameOf(subject.path);
      const property: VocabularyTreeProperty = {
        path: subject.path,
        name: propertyNameOf(objectName, subject.path),
        dataType: subject.dataType,
      };
      const bucket = byObject.get(objectName);
      if (bucket === undefined) {
        byObject.set(objectName, [property]);
      } else {
        bucket.push(property);
      }
    }

    const objects: VocabularyTreeObject[] = [...byObject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, properties]) => ({
        name,
        label: humanize(name),
        properties: properties.sort((a, b) => a.path.localeCompare(b.path)),
      }));

    return {
      objects,
      operators: [...OPERATORS].sort((a, b) => a.localeCompare(b)),
      outcomes: [...OUTCOMES].sort((a, b) => a.localeCompare(b)),
    };
  }

  /**
   * Narrows the grounding subjects for a scoped interpret request. PROPERTY scope
   * (exact subject paths) takes precedence over OBJECT scope (object names); an empty
   * scope yields the full subject set. Mirrors the .NET `TryResolveScopedCatalog`:
   * every requested object/property must be known, so the UI can never silently scope
   * the interpreter to nothing.
   */
  async resolveScope(
    objects?: readonly string[],
    properties?: readonly string[],
  ): Promise<ScopeResolution> {
    const all = await this.projectSubjects();

    const requestedProps = (properties ?? []).filter((p) => p.trim() !== '');
    if (requestedProps.length > 0) {
      const knownPaths = new Set(all.map((s) => s.path));
      const unknown = [
        ...new Set(requestedProps.filter((p) => !knownPaths.has(p))),
      ];
      if (unknown.length > 0) {
        return {
          ok: false,
          subjects: all,
          error: `Unknown properties: ${unknown.join(', ')}.`,
        };
      }
      const wanted = new Set(requestedProps);
      return { ok: true, subjects: all.filter((s) => wanted.has(s.path)) };
    }

    const requestedObjects = (objects ?? []).filter((o) => o.trim() !== '');
    if (requestedObjects.length > 0) {
      const knownObjects = new Set(all.map((s) => objectNameOf(s.path)));
      const unknown = [
        ...new Set(requestedObjects.filter((o) => !knownObjects.has(o))),
      ];
      if (unknown.length > 0) {
        return {
          ok: false,
          subjects: all,
          error: `Unknown objects (no matching subjects): ${unknown.join(', ')}.`,
        };
      }
      const wanted = new Set(requestedObjects);
      return {
        ok: true,
        subjects: all.filter((s) => wanted.has(objectNameOf(s.path))),
      };
    }

    return { ok: true, subjects: all };
  }

  /** Loads Active fields on Active entities as sorted {@link GroundedSubject}s. */
  private async projectSubjects(): Promise<GroundedSubject[]> {
    const entities = await this.prisma.entity.findMany({
      where: { status: RegistryStatus.Active },
      include: { fields: { where: { status: RegistryStatus.Active } } },
      orderBy: { key: 'asc' },
    });

    return entities
      .flatMap((entity) =>
        entity.fields.map((field) => ({
          path: `${entity.key}.${field.name}`,
          dataType: field.dataType,
          allowedValues: [...field.allowedValues],
        })),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

/** The object name for a subject path: the first dotted segment. */
function objectNameOf(path: string): string {
  const dot = path.indexOf('.');
  return dot < 0 ? path : path.slice(0, dot);
}

/** The property name relative to its object: the path minus the `object.` prefix. */
function propertyNameOf(objectName: string, path: string): string {
  return path.length > objectName.length && path[objectName.length] === '.'
    ? path.slice(objectName.length + 1)
    : path;
}

/**
 * Humanizes a camelCase object name into a display label: inserts a space at each
 * lowerUpper boundary then title-cases each word (e.g. `medicalReview` ->
 * `Medical Review`, `order` -> `Order`). Mirrors the .NET `Humanize`.
 */
function humanize(name: string): string {
  if (name.length === 0) {
    return name;
  }
  let spaced = '';
  for (let i = 0; i < name.length; i++) {
    const current = name[i];
    if (
      i > 0 &&
      current >= 'A' &&
      current <= 'Z' &&
      !(name[i - 1] >= 'A' && name[i - 1] <= 'Z')
    ) {
      spaced += ' ';
    }
    spaced += current;
  }
  return spaced
    .split(' ')
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1),
    )
    .join(' ');
}
