/**
 * Entity -> JSON Schema (draft 2020-12) compiler.
 *
 * Compiles a registry entity (its Active fields) into a JSON Schema describing
 * the shape of that entity's sub-document within a fact document. Dotted field
 * names expand into NESTED object properties (e.g. field "client.nyStatus" on
 * entity "order" -> { client: { nyStatus: ... } }); a trailing "[]" denotes an
 * array (Collection) field. Data types map to JSON Schema types; allowedValues
 * become enums; required fields become `required` constraints.
 *
 * Lenient by default (`additionalProperties: true`) because transactions may
 * carry extra data the registry has not (yet) modelled; a strict mode is
 * exposed for callers that want a closed shape.
 */

import { FieldDataType, RegistryStatus } from '@prisma/client';

/** Minimal field shape this compiler needs (decoupled from Prisma row type). */
export interface CompilableField {
  name: string;
  dataType: FieldDataType;
  required: boolean;
  allowedValues: string[];
  status: RegistryStatus;
}

/** Minimal entity shape this compiler needs. */
export interface CompilableEntity {
  key: string;
  fields: CompilableField[];
}

/** A JSON Schema object node (the only node kind we emit at each level). */
export interface JsonSchemaNode {
  type?: string | string[];
  format?: string;
  enum?: string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  additionalProperties?: boolean;
  $schema?: string;
  title?: string;
}

export interface CompileOptions {
  /** When true, emit `additionalProperties: false` at every object level. */
  strict?: boolean;
}

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/** Maps a scalar field data type to its JSON Schema leaf node. */
function leafForDataType(field: CompilableField): JsonSchemaNode {
  const enumConstraint =
    field.allowedValues.length > 0 ? { enum: [...field.allowedValues] } : {};

  switch (field.dataType) {
    case FieldDataType.String:
      return { type: 'string', ...enumConstraint };
    case FieldDataType.Number:
      return { type: 'number' };
    case FieldDataType.Boolean:
      return { type: 'boolean' };
    case FieldDataType.Date:
      // Dates are carried as ISO-8601 strings on the wire.
      return { type: 'string', format: 'date-time' };
    case FieldDataType.Collection:
      // Untyped array: element shape is not modelled by the flat registry.
      return { type: 'array' };
    default: {
      // Exhaustiveness guard — unreachable while the enum is closed.
      const exhaustive: never = field.dataType;
      throw new Error(`Unhandled field data type: ${String(exhaustive)}`);
    }
  }
}

/**
 * Strips the trailing "[]" collection marker from a field name segment path,
 * returning the dot-path segments. "tests[]" -> ["tests"];
 * "client.nyStatus" -> ["client", "nyStatus"].
 */
function pathSegments(fieldName: string): string[] {
  const withoutCollection = fieldName.endsWith('[]')
    ? fieldName.slice(0, -2)
    : fieldName;
  return withoutCollection.split('.');
}

/**
 * Ensures a nested object node exists at the given path (creating intermediate
 * object nodes), and returns the parent node plus the final segment key so the
 * caller can attach the leaf.
 */
function ensureParent(
  root: JsonSchemaNode,
  segments: string[],
  strict: boolean,
): { parent: JsonSchemaNode; leafKey: string } {
  let current = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    current.properties ??= {};
    let next = current.properties[segment];
    if (!next || next.type !== 'object') {
      next = {
        type: 'object',
        properties: {},
        additionalProperties: !strict,
      };
      current.properties[segment] = next;
    }
    current = next;
  }
  return { parent: current, leafKey: segments[segments.length - 1] };
}

/** Marks a property name required on the given object node (idempotent). */
function markRequired(node: JsonSchemaNode, propertyName: string): void {
  node.required ??= [];
  if (!node.required.includes(propertyName)) {
    node.required.push(propertyName);
  }
}

/**
 * Compiles an entity into a JSON Schema describing its sub-document shape.
 * Only Active fields are included; Deprecated/retired fields are not validated.
 */
export function compileEntitySchema(
  entity: CompilableEntity,
  options: CompileOptions = {},
): JsonSchemaNode {
  const strict = options.strict ?? false;
  const root: JsonSchemaNode = {
    $schema: DRAFT,
    title: entity.key,
    type: 'object',
    properties: {},
    additionalProperties: !strict,
  };

  for (const field of entity.fields) {
    if (field.status !== RegistryStatus.Active) {
      continue;
    }
    const segments = pathSegments(field.name);
    const { parent, leafKey } = ensureParent(root, segments, strict);

    parent.properties ??= {};
    parent.properties[leafKey] = leafForDataType(field);

    if (field.required) {
      markRequired(parent, leafKey);
    }
  }

  return root;
}
