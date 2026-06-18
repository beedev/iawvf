import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ProblemDetailsFilter } from './../src/common/filters/problem-details.filter';
import { RULE_INTERPRETER } from './../src/authoring/llm/interpreter';
import { StubRuleInterpreter } from './../src/authoring/llm/stub-rule-interpreter';
import { RulesCorpusImporter } from './../src/rules/rules-corpus.importer';

/**
 * End-to-end coverage of the N6 API surface (evaluate, authoring, governed rules),
 * matching the contract the existing React UI client calls. Requires a reachable
 * PostgreSQL; the bootstrap seeds the registry + imports the rule corpus, so the
 * governed store and the engine have PM17 et al. to work with.
 *
 * The live OpenAI interpreter is overridden with the deterministic offline stub so
 * `/api/authoring/interpret` performs NO network I/O and is fully reproducible.
 */
describe('N6 API surface (e2e)', () => {
  let app: INestApplication<App>;

  const login = async (username: string, password: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

  // PM17 fires (assert document.circledHE IsPresent fails -> CompleteHold) when the
  // FISH-on-FFPE guard holds and no circled H&E is present.
  const pm17FiresFacts = {
    test: {
      code: 'FISH-T-001',
      specimen: { type: 'FFPE' },
      orderedTest: 'FISH-T-001',
    },
    specimen: { type: 'FFPE', age: 10, fixationTime: 24 },
    patient: { age: 45, gender: 'Male' },
    order: {
      client: { nyStatus: 'Standard' },
      performingLab: 'Lab-NY-1',
      specimens: [{}],
    },
  };

  // A well-formed PM17 rule body (mirrors rules/PM17.json + the stub builder).
  const pm17RuleJson = {
    key: 'PM17',
    name: 'Circled H&E required for Technical FISH on FFPE',
    priority: 10,
    phase: 'Validate',
    appliesWhen: {
      type: 'group',
      logicalOp: 'All',
      conditions: [
        {
          type: 'leaf',
          subject: 'test.code',
          operator: 'InSet',
          reference: 'TechnicalFISH',
        },
        {
          type: 'leaf',
          subject: 'test.specimen.type',
          operator: 'Equals',
          value: 'FFPE',
        },
      ],
    },
    assert: {
      type: 'leaf',
      subject: 'document.circledHE',
      operator: 'IsPresent',
    },
    onSuccess: { type: 'Continue' },
    onFailure: {
      type: 'CompleteHold',
      scope: 'order',
      reason: 'Circled H&E not present for Technical FISH on FFPE',
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // No network at authoring time: ground interpretation on the offline stub.
      .overrideProvider(RULE_INTERPRETER)
      .useClass(StubRuleInterpreter)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    // Sibling unit specs may wipe the rule table; guarantee the corpus (PM17 +
    // reference data such as TechnicalFISH) is present so this suite is order-
    // independent. importCorpus appends versions idempotently for reads.
    await app.get(RulesCorpusImporter).importCorpus();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ── /api/evaluate ─────────────────────────────────────────────────────────

  describe('POST /api/evaluate', () => {
    it('rejects an unauthenticated request (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/evaluate')
        .send({ factsJson: pm17FiresFacts })
        .expect(401);
    });

    it('fires PM17 (CompleteHold), populates the trace, and includes a validation block', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .post('/api/evaluate')
        .set('Authorization', `Bearer ${token}`)
        .send({ factsJson: pm17FiresFacts })
        .expect(200);

      const body = res.body as {
        outcomes: {
          type: string;
          ruleKey: string | null;
          ruleName: string | null;
        }[];
        trace: { ruleKey: string; ruleName: string | null }[];
        factsAfter: Record<string, unknown> | null;
        validation: { valid: boolean; errors: unknown[] };
      };
      expect(body.outcomes.some((o) => o.type === 'CompleteHold')).toBe(true);
      expect(body.trace.length).toBeGreaterThan(0);
      expect(body.trace.some((t) => t.ruleKey === 'PM17')).toBe(true);
      expect(body.validation).toBeDefined();
      expect(Array.isArray(body.validation.errors)).toBe(true);
      // The PM17-fires facts are registry-clean.
      expect(body.validation.valid).toBe(true);

      // N6 enrichment: outcomes are attributed to their originating rule. PM17 produces a
      // CompleteHold for these facts; that outcome carries ruleKey "PM17" and a non-empty,
      // human-readable ruleName. (Other rules — e.g. PM13 — may also hold; we target PM17.)
      const pm17Outcome = body.outcomes.find((o) => o.ruleKey === 'PM17');
      expect(pm17Outcome).toBeDefined();
      expect(pm17Outcome!.type).toBe('CompleteHold');
      expect(typeof pm17Outcome!.ruleName).toBe('string');
      expect(pm17Outcome!.ruleName!.length).toBeGreaterThan(0);
      // Every produced outcome should be attributable (no orphan business outcomes).
      expect(body.outcomes.every((o) => typeof o.ruleKey === 'string')).toBe(
        true,
      );
      // The trace mirror also carries the readable name for the PM17 entry.
      const pm17Trace = body.trace.find((t) => t.ruleKey === 'PM17');
      expect(pm17Trace!.ruleName).toBe(pm17Outcome!.ruleName);
    });

    it('reports a registry enum mismatch in the validation block but still returns outcomes', async () => {
      const token = await login('author', 'author-pw');
      const bad = {
        ...pm17FiresFacts,
        specimen: { type: 'Saliva', age: 10, fixationTime: 24 },
      };
      const res = await request(app.getHttpServer())
        .post('/api/evaluate')
        .set('Authorization', `Bearer ${token}`)
        .send({ factsJson: bad })
        .expect(200);

      const body = res.body as {
        outcomes: unknown[];
        validation: { valid: boolean; errors: { path: string }[] };
      };
      expect(body.validation.valid).toBe(false);
      expect(
        body.validation.errors.some((e) => e.path.startsWith('specimen')),
      ).toBe(true);
      // Not strict: outcomes are still produced.
      expect(Array.isArray(body.outcomes)).toBe(true);
    });
  });

  // ── /api/authoring ──────────────────────────────────────────────────────────

  describe('authoring', () => {
    it('GET /api/authoring/vocabulary returns objects (order, specimen) with properties', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .get('/api/authoring/vocabulary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = res.body as {
        objects: {
          name: string;
          label: string;
          properties: { path: string }[];
        }[];
        operators: string[];
        outcomes: string[];
      };
      const names = body.objects.map((o) => o.name);
      expect(names).toEqual(expect.arrayContaining(['order', 'specimen']));
      const specimen = body.objects.find((o) => o.name === 'specimen');
      expect(specimen!.properties.length).toBeGreaterThan(0);
      expect(body.operators).toEqual(
        expect.arrayContaining(['Equals', 'InSet']),
      );
      expect(body.outcomes).toEqual(expect.arrayContaining(['CompleteHold']));
    });

    it('POST /api/authoring/interpret (stub) with objects:["specimen"] returns a candidate for a circled-H&E + FISH sentence', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .post('/api/authoring/interpret')
        .set('Authorization', `Bearer ${token}`)
        .send({
          naturalLanguage:
            'Require a circled H&E slide when a Technical FISH test is ordered.',
          objects: ['specimen'],
        })
        .expect(200);

      const body = res.body as {
        candidate: Record<string, unknown> | null;
        confidence: number;
      };
      expect(body.candidate).not.toBeNull();
      expect(body.confidence).toBeGreaterThan(0);
    });

    it('POST /api/authoring/interpret rejects an unknown scope object (400)', async () => {
      const token = await login('author', 'author-pw');
      await request(app.getHttpServer())
        .post('/api/authoring/interpret')
        .set('Authorization', `Bearer ${token}`)
        .send({ naturalLanguage: 'anything', objects: ['nope-not-a-thing'] })
        .expect(400);
    });

    it('POST /api/authoring/lint flags an unknown subject as an Error', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .post('/api/authoring/lint')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ruleJson: {
            key: 'UNK1',
            name: 'Unknown subject rule',
            phase: 'Validate',
            assert: {
              type: 'leaf',
              subject: 'gizmo.widget',
              operator: 'IsPresent',
            },
            onSuccess: { type: 'Continue' },
            onFailure: { type: 'Warning', reason: 'x' },
          },
        })
        .expect(200);

      const body = res.body as {
        isValid: boolean;
        findings: { severity: string; code: string }[];
      };
      expect(body.isValid).toBe(false);
      expect(body.findings.some((f) => f.severity === 'Error')).toBe(true);
    });

    it('POST /api/authoring/paraphrase (PM17) returns a non-empty paraphrase', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .post('/api/authoring/paraphrase')
        .set('Authorization', `Bearer ${token}`)
        .send({ ruleJson: pm17RuleJson })
        .expect(200);
      expect(
        (res.body as { paraphrase: string }).paraphrase.length,
      ).toBeGreaterThan(0);
    });

    it('POST /api/authoring/dry-run (PM17) yields hits over the corpus', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .post('/api/authoring/dry-run')
        .set('Authorization', `Bearer ${token}`)
        .send({ ruleJson: pm17RuleJson })
        .expect(200);

      const body = res.body as {
        evaluated: number;
        hits: { fixtureName: string; applied: boolean }[];
      };
      expect(body.evaluated).toBeGreaterThan(0);
      expect(body.hits.some((h) => h.applied)).toBe(true);
    });
  });

  // ── /api/rules governance ─────────────────────────────────────────────────

  describe('rules governance', () => {
    const key = `E2E${Date.now()}`;
    const newRule = (): Record<string, unknown> => ({
      key,
      name: 'E2E created rule',
      priority: 5,
      phase: 'Validate',
      assert: { type: 'leaf', subject: 'order.type', operator: 'IsPresent' },
      onSuccess: { type: 'Continue' },
      onFailure: {
        type: 'PreventAction',
        scope: 'order',
        reason: 'order.type missing',
        parameters: { Action: 'submit-order' },
      },
    });

    it('Author can create a rule (lint-clean) and read it back', async () => {
      const token = await login('author', 'author-pw');
      const created = await request(app.getHttpServer())
        .post('/api/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ ruleJson: newRule() })
        .expect(201);
      expect((created.body as { key: string }).key).toBe(key);

      const fetched = await request(app.getHttpServer())
        .get(`/api/rules/${key}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = fetched.body as {
        summary: { key: string };
        ruleJson: Record<string, unknown> | null;
        authoredBy: string | null;
      };
      expect(body.summary.key).toBe(key);
      expect(body.ruleJson).not.toBeNull();
      expect(body.authoredBy).toBe('author');
    });

    it('rejects a lint-error rule (unknown subject) with 422 carrying the LintReport', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .post('/api/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ruleJson: {
            key: `BAD${Date.now()}`,
            name: 'bad',
            phase: 'Validate',
            assert: {
              type: 'leaf',
              subject: 'gizmo.widget',
              operator: 'IsPresent',
            },
            onSuccess: { type: 'Continue' },
            onFailure: { type: 'Warning', reason: 'x' },
          },
        })
        .expect(422);
      const body = res.body as { isValid: boolean; findings: unknown[] };
      expect(body.isValid).toBe(false);
      expect(Array.isArray(body.findings)).toBe(true);
    });

    it('Reviewer can approve; the approver recorded is the authenticated user', async () => {
      const reviewer = await login('reviewer', 'reviewer-pw');
      const res = await request(app.getHttpServer())
        .post(`/api/rules/${key}/approve`)
        .set('Authorization', `Bearer ${reviewer}`)
        // Body approver is a display hint only; it must be ignored for the audit identity.
        .send({ approver: 'someone-else' })
        .expect(200);
      expect((res.body as { key: string }).key).toBe(key);

      const author = await login('author', 'author-pw');
      const detail = await request(app.getHttpServer())
        .get(`/api/rules/${key}`)
        .set('Authorization', `Bearer ${author}`)
        .expect(200);
      expect((detail.body as { approvedBy: string | null }).approvedBy).toBe(
        'reviewer',
      );
    });

    it('forbids an Author from approving (403)', async () => {
      const author = await login('author', 'author-pw');
      await request(app.getHttpServer())
        .post(`/api/rules/${key}/approve`)
        .set('Authorization', `Bearer ${author}`)
        .send({})
        .expect(403);
    });

    it('returns ProblemDetails on a 404 for a missing rule', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .get('/api/rules/does-not-exist-xyz')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body as { status: number; title: string }).toMatchObject({
        status: 404,
        title: 'Not Found',
      });
    });
  });
});
