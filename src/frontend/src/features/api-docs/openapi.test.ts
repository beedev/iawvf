import { describe, it, expect } from 'vitest';
import { buildApiReference, groupKeyFor, resolveSchema, type OpenApiDocument } from './openapi';

/**
 * A small, representative OpenAPI 3 fixture mirroring the real VDF spec's shape: a public login
 * (tagged `auth`), a secured evaluate POST (tagged `evaluate`) whose body and response resolve via
 * `$ref`, and an untagged path that must fall back to its path prefix for grouping.
 */
const FIXTURE: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'IAW Validation & Decision Framework — API', version: '0.1.0' },
  components: {
    schemas: {
      LoginDto: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'author', description: 'Account username.' },
          password: { type: 'string', example: 'author-pw' },
        },
      },
      EvaluateRequestDto: {
        type: 'object',
        required: ['factsJson'],
        properties: {
          factsJson: { type: 'object', additionalProperties: true, example: { specimen: {} } },
          strict: { type: 'boolean', description: 'Block on validation failure.' },
        },
      },
      OutcomeDto: {
        type: 'object',
        required: ['type'],
        properties: { type: { type: 'string' }, group: { type: 'string' } },
      },
      EvaluateResponseDto: {
        type: 'object',
        required: ['outcomes'],
        properties: {
          outcomes: { type: 'array', items: { $ref: '#/components/schemas/OutcomeDto' } },
        },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Authenticate and obtain a JWT bearer token.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginDto' } } },
        },
        responses: { '200': { description: '' }, '401': { description: 'Invalid credentials.' } },
      },
    },
    '/api/evaluate': {
      post: {
        tags: ['evaluate'],
        summary: 'Evaluate facts against the active rule set.',
        security: [{ bearer: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/EvaluateRequestDto' } },
          },
        },
        responses: {
          '200': {
            description: 'Outcomes + trace.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EvaluateResponseDto' },
              },
            },
          },
        },
      },
    },
    '/api/rules': {
      // Untagged on purpose: grouping must fall back to the path prefix (skipping `api`).
      get: { summary: 'List active rules.', security: [{ bearer: [] }], responses: {} },
    },
  },
};

describe('groupKeyFor', () => {
  it('prefers the operation tag', () => {
    expect(groupKeyFor('/api/auth/login', { tags: ['auth'] })).toBe('auth');
  });

  it('falls back to the path prefix, skipping a leading /api segment', () => {
    expect(groupKeyFor('/api/rules', {})).toBe('rules');
    expect(groupKeyFor('/health', {})).toBe('health');
  });
});

describe('resolveSchema', () => {
  const schemas = FIXTURE.components!.schemas!;

  it('resolves a $ref into named, flattened fields with required flags', () => {
    const resolved = resolveSchema({ $ref: '#/components/schemas/LoginDto' }, schemas);
    expect(resolved?.typeLabel).toBe('LoginDto');
    const names = resolved?.fields.map((f) => f.name);
    expect(names).toEqual(['username', 'password']);
    expect(resolved?.fields.find((f) => f.name === 'username')?.required).toBe(true);
  });

  it('labels an array-of-$ref as Element[] and surfaces the element fields', () => {
    const resolved = resolveSchema(schemas.EvaluateResponseDto, schemas);
    const outcomes = resolved?.fields.find((f) => f.name === 'outcomes');
    expect(outcomes?.type).toBe('OutcomeDto[]');
  });

  it('composes an example from per-property examples when none is given at the top level', () => {
    const resolved = resolveSchema({ $ref: '#/components/schemas/LoginDto' }, schemas);
    expect(resolved?.example).toEqual({ username: 'author', password: 'author-pw' });
  });
});

describe('buildApiReference', () => {
  it('groups endpoints by tag, then by path prefix for untagged ops', () => {
    const ref = buildApiReference(FIXTURE);
    const ids = ref.groups.map((g) => g.id);
    expect(ids).toContain('auth');
    expect(ids).toContain('evaluate');
    expect(ids).toContain('rules'); // untagged GET /api/rules

    const evaluate = ref.groups.find((g) => g.id === 'evaluate')!;
    expect(evaluate.title).toBe('Evaluate');
    expect(evaluate.endpoints).toHaveLength(1);
  });

  it('orders the known groups narratively (auth before evaluate before rules)', () => {
    const ref = buildApiReference(FIXTURE);
    const ids = ref.groups.map((g) => g.id);
    expect(ids.indexOf('auth')).toBeLessThan(ids.indexOf('evaluate'));
    expect(ids.indexOf('evaluate')).toBeLessThan(ids.indexOf('rules'));
  });

  it('extracts method, path, summary, and auth requirement per endpoint', () => {
    const ref = buildApiReference(FIXTURE);
    const login = ref.groups.find((g) => g.id === 'auth')!.endpoints[0];
    expect(login.method).toBe('POST');
    expect(login.path).toBe('/api/auth/login');
    expect(login.summary).toBe('Authenticate and obtain a JWT bearer token.');
    expect(login.requiresAuth).toBe(false); // no security on this operation

    const evaluate = ref.groups.find((g) => g.id === 'evaluate')!.endpoints[0];
    expect(evaluate.requiresAuth).toBe(true);
    expect(evaluate.requestBody?.typeLabel).toBe('EvaluateRequestDto');
    expect(evaluate.successResponse?.status).toBe('200');
    expect(evaluate.successResponse?.schema?.typeLabel).toBe('EvaluateResponseDto');
  });

  it('reports a total endpoint count and the spec title/version', () => {
    const ref = buildApiReference(FIXTURE);
    expect(ref.title).toBe('IAW Validation & Decision Framework — API');
    expect(ref.version).toBe('0.1.0');
    expect(ref.endpointCount).toBe(3);
  });
});
