import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ProblemDetailsFilter } from './../src/common/filters/problem-details.filter';

/**
 * End-to-end coverage of the N1 entity registry HTTP surface. Requires a
 * reachable PostgreSQL. The app bootstrap seeds the canonical registry, so
 * GET endpoints have data to return.
 */
describe('Entity registry (e2e)', () => {
  let app: INestApplication<App>;

  const login = async (username: string, password: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    // Triggers OnApplicationBootstrap (seeder).
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/registry/entities', () => {
    it('requires authentication (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/registry/entities')
        .expect(401);
    });

    it('returns seeded entities with fields for an authenticated user', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .get('/api/registry/entities')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = res.body as { key: string; fields: unknown[] }[];
      expect(body.length).toBeGreaterThanOrEqual(8);
      const order = body.find((e) => e.key === 'order');
      expect(order).toBeDefined();
      expect(order!.fields.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/registry/entities (RBAC + case-insensitive dup)', () => {
    const uniqueKey = `e2eKit${Date.now()}`;

    it('forbids an Author (403)', async () => {
      const token = await login('author', 'author-pw');
      await request(app.getHttpServer())
        .post('/api/registry/entities')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: uniqueKey })
        .expect(403);
    });

    it('allows an Admin (201) then rejects a case-variant duplicate (409)', async () => {
      const token = await login('admin', 'admin-pw');
      const created = await request(app.getHttpServer())
        .post('/api/registry/entities')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: uniqueKey })
        .expect(201);
      expect((created.body as { key: string }).key).toBe(
        uniqueKey.toLowerCase(),
      );

      await request(app.getHttpServer())
        .post('/api/registry/entities')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: uniqueKey.toUpperCase() })
        .expect(409);
    });
  });

  describe('POST /api/registry/validate', () => {
    it('returns errors for a bad fact (authenticated)', async () => {
      const token = await login('reviewer', 'reviewer-pw');
      const res = await request(app.getHttpServer())
        .post('/api/registry/validate')
        .set('Authorization', `Bearer ${token}`)
        .send({ facts: { specimen: { type: 'Saliva', fixationTime: 'x' } } })
        .expect(200);
      const body = res.body as {
        valid: boolean;
        errors: { entity: string; path: string }[];
      };
      expect(body.valid).toBe(false);
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('returns valid for a good fact', async () => {
      const token = await login('reviewer', 'reviewer-pw');
      const res = await request(app.getHttpServer())
        .post('/api/registry/validate')
        .set('Authorization', `Bearer ${token}`)
        .send({ facts: { patient: { gender: 'Female', age: 33 } } })
        .expect(200);
      expect((res.body as { valid: boolean }).valid).toBe(true);
    });
  });

  describe('GET /api/registry/vocabulary', () => {
    it('returns objects with their fields', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .get('/api/registry/vocabulary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = res.body as {
        objects: { key: string; properties: { path: string }[] }[];
      };
      const specimen = body.objects.find((o) => o.key === 'specimen');
      expect(specimen).toBeDefined();
      expect(
        specimen!.properties.some((p) => p.path === 'specimen.fixationTime'),
      ).toBe(true);
    });
  });
});
