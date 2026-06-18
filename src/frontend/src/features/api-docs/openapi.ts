/**
 * A minimal, dependency-free model of the OpenAPI 3 document plus the pure transform that powers the
 * API Reference page. The page renders LIVE from the server's `/swagger-json`, so this module never
 * hand-writes endpoint facts — it parses whatever the spec declares and reshapes it into a scannable,
 * grouped structure. Keeping it free of React makes the grouping + schema-resolution logic trivially
 * testable in isolation.
 */

// ── OpenAPI 3 subset ────────────────────────────────────────────────────────────────────────────
//
// We model only the slices the reference renders. `additionalProperties: true`-style fields are kept
// loose (`unknown`) on purpose — the spec is server-owned and may grow.

export interface OpenApiSchema {
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: unknown[];
  example?: unknown;
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  additionalProperties?: boolean | OpenApiSchema;
  $ref?: string;
}

export interface OpenApiMediaType {
  schema?: OpenApiSchema;
}

export interface OpenApiRequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, OpenApiPathItem>;
  components?: { schemas?: Record<string, OpenApiSchema> };
  security?: Array<Record<string, string[]>>;
}

// ── Reshaped, render-ready model ─────────────────────────────────────────────────────────────────

/** A flattened field row extracted from a (resolved) object schema, for compact display. */
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

/** A resolved schema summary: its display type, optional flattened fields, and an example payload. */
export interface ResolvedSchema {
  /** Human-readable type label, e.g. `object`, `EvaluateRequestDto`, `OutcomeDto[]`. */
  typeLabel: string;
  /** Flattened first-level fields when the schema (or its array items) is an object. */
  fields: SchemaField[];
  /** A representative example value, when the spec supplies one (directly or via properties). */
  example?: unknown;
}

export interface ApiEndpoint {
  id: string;
  method: Uppercase<HttpMethod>;
  path: string;
  summary?: string;
  description?: string;
  /** True when the operation declares its own security (a bearer token is required). */
  requiresAuth: boolean;
  parameters: OpenApiParameter[];
  requestBody?: ResolvedSchema;
  /** The primary success (2xx) response shape, when one is declared. */
  successResponse?: { status: string; description?: string; schema?: ResolvedSchema };
}

export interface ApiGroup {
  /** Stable slug for keys/testids, e.g. `evaluate`. */
  id: string;
  /** Display title, e.g. `Evaluate`. */
  title: string;
  endpoints: ApiEndpoint[];
}

export interface ApiReference {
  title: string;
  version?: string;
  groups: ApiGroup[];
  /** Total endpoint count across all groups (handy for the page summary). */
  endpointCount: number;
}

const METHOD_ORDER: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

/**
 * A curated display order + titles for the framework's known tags / prefixes, so the reference reads
 * in a sensible narrative (auth first, evaluate as the headline, governance last) rather than the
 * spec's incidental object order. Unknown groups fall back to a title-cased label and sort last.
 */
const GROUP_META: Record<string, { title: string; order: number }> = {
  auth: { title: 'Auth', order: 0 },
  evaluate: { title: 'Evaluate', order: 1 },
  authoring: { title: 'Authoring', order: 2 },
  rules: { title: 'Rules & governance', order: 3 },
  registry: { title: 'Registry', order: 4 },
  health: { title: 'Health', order: 5 },
};

function titleCase(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Derive a group slug for an operation: prefer the first tag, else the path's leading segment. */
export function groupKeyFor(path: string, operation: OpenApiOperation): string {
  const tag = operation.tags?.find((t) => t && t.trim().length > 0);
  if (tag) return tag.trim().toLowerCase();

  // Fall back to a meaningful path segment: skip a leading `api` so `/api/evaluate` → `evaluate`.
  const segments = path.split('/').filter(Boolean);
  const first = segments[0] === 'api' ? segments[1] : segments[0];
  return (first ?? 'general').toLowerCase();
}

/** Resolve a local component name from a `$ref` like `#/components/schemas/EvaluateRequestDto`. */
function refName(ref: string): string | undefined {
  const match = /#\/components\/schemas\/(.+)$/.exec(ref);
  return match?.[1];
}

/** A compact, human label for a schema's type (resolving $ref names and array element types). */
function typeLabel(schema: OpenApiSchema): string {
  if (schema.$ref) return refName(schema.$ref) ?? 'object';
  if (schema.type === 'array' && schema.items) return `${typeLabel(schema.items)}[]`;
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum.map((v) => String(v)).join(' | ');
  }
  if (schema.type) return schema.format ? `${schema.type} (${schema.format})` : schema.type;
  if (schema.properties) return 'object';
  return 'any';
}

/**
 * Resolve a schema (following one level of `$ref` into the component registry) into a render-ready
 * summary: a type label, flattened first-level fields (for objects or arrays-of-objects), and any
 * example the spec carries. Self-referential refs are guarded by a visited set.
 */
export function resolveSchema(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
  visited: Set<string> = new Set(),
): ResolvedSchema | undefined {
  if (!schema) return undefined;

  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (!name || visited.has(name)) return { typeLabel: name ?? 'object', fields: [] };
    const target = schemas[name];
    if (!target) return { typeLabel: name, fields: [] };
    const next = new Set(visited).add(name);
    const resolved = resolveSchema(target, schemas, next);
    return resolved ? { ...resolved, typeLabel: name } : { typeLabel: name, fields: [] };
  }

  // Array → resolve the element shape but present it as `Element[]`.
  if (schema.type === 'array' && schema.items) {
    const inner = resolveSchema(schema.items, schemas, visited);
    return {
      typeLabel: `${inner?.typeLabel ?? typeLabel(schema.items)}[]`,
      fields: inner?.fields ?? [],
      example: schema.example,
    };
  }

  const required = new Set(schema.required ?? []);
  const fields: SchemaField[] = Object.entries(schema.properties ?? {}).map(([name, prop]) => ({
    name,
    type: typeLabel(prop),
    required: required.has(name),
    description: prop.description,
  }));

  return {
    typeLabel: typeLabel(schema),
    fields,
    example: schema.example ?? buildExample(schema, schemas),
  };
}

/**
 * Best-effort example: prefer an explicit `example`, otherwise compose one from per-property examples
 * so the docs show a realistic shape even when the spec only annotates leaf fields.
 */
function buildExample(
  schema: OpenApiSchema,
  schemas: Record<string, OpenApiSchema>,
  depth = 0,
): unknown {
  if (depth > 3) return undefined;
  if (schema.example !== undefined) return schema.example;

  if (schema.$ref) {
    const name = refName(schema.$ref);
    const target = name ? schemas[name] : undefined;
    return target ? buildExample(target, schemas, depth + 1) : undefined;
  }
  if (schema.type === 'array' && schema.items) {
    const item = buildExample(schema.items, schemas, depth + 1);
    return item === undefined ? undefined : [item];
  }
  if (schema.properties) {
    const out: Record<string, unknown> = {};
    let any = false;
    for (const [name, prop] of Object.entries(schema.properties)) {
      const v = buildExample(prop, schemas, depth + 1);
      if (v !== undefined) {
        out[name] = v;
        any = true;
      }
    }
    return any ? out : undefined;
  }
  return undefined;
}

/** Pick the first 2xx response and resolve its JSON schema, if any. */
function pickSuccessResponse(
  operation: OpenApiOperation,
  schemas: Record<string, OpenApiSchema>,
): ApiEndpoint['successResponse'] {
  const responses = operation.responses ?? {};
  const status = Object.keys(responses)
    .filter((s) => /^2\d\d$/.test(s))
    .sort()[0];
  if (!status) return undefined;
  const response = responses[status];
  const schema = response.content?.['application/json']?.schema;
  return { status, description: response.description, schema: resolveSchema(schema, schemas) };
}

/**
 * The page's load-bearing transform: turn a raw OpenAPI document into grouped, render-ready endpoints
 * with method/path/summary, auth requirement, resolved request body, and the primary success shape.
 * Pure and deterministic — given the same spec it always produces the same reference.
 */
export function buildApiReference(doc: OpenApiDocument): ApiReference {
  const schemas = doc.components?.schemas ?? {};
  const docSecured = (doc.security?.length ?? 0) > 0;
  const groups = new Map<string, ApiGroup>();

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHOD_ORDER) {
      const operation = item[method];
      if (!operation) continue;

      const key = groupKeyFor(path, operation);
      const meta = GROUP_META[key];
      if (!groups.has(key)) {
        groups.set(key, { id: key, title: meta?.title ?? titleCase(key), endpoints: [] });
      }

      const requiresAuth =
        operation.security !== undefined ? operation.security.length > 0 : docSecured;

      groups.get(key)!.endpoints.push({
        id: `${method}-${path}`,
        method: method.toUpperCase() as Uppercase<HttpMethod>,
        path,
        summary: operation.summary,
        description: operation.description,
        requiresAuth,
        parameters: operation.parameters ?? [],
        requestBody: resolveSchema(
          operation.requestBody?.content?.['application/json']?.schema,
          schemas,
        ),
        successResponse: pickSuccessResponse(operation, schemas),
      });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => {
    const oa = GROUP_META[a.id]?.order ?? 100;
    const ob = GROUP_META[b.id]?.order ?? 100;
    return oa === ob ? a.title.localeCompare(b.title) : oa - ob;
  });

  return {
    title: doc.info?.title ?? 'API Reference',
    version: doc.info?.version,
    groups: ordered,
    endpointCount: ordered.reduce((sum, g) => sum + g.endpoints.length, 0),
  };
}
