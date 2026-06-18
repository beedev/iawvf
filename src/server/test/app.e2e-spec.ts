import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ProblemDetailsFilter } from './../src/common/filters/problem-details.filter';

/**
 * End-to-end coverage of the N0 foundation: health, authentication, and RBAC.
 * Requires a reachable PostgreSQL (see src/server/.env DATABASE_URL).
 */
describe('IAW server (e2e)', () => {
  let app: INestApplication<App>;

  const login = async (username: string, password: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    const body = res.body as { accessToken: string };
    return body.accessToken;
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health (public)', () => {
    it('returns 200 with aggregate status and postgres check', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = res.body as {
        status: string;
        checks: { name: string; status: string }[];
      };
      expect(body.status).toBe('ok');
      expect(body.checks).toEqual(
        expect.arrayContaining([{ name: 'postgres', status: 'ok' }]),
      );
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated protected route with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/_probe')
        .expect(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.body as {
        status: number;
        title: string;
        traceId: string;
      };
      expect(body).toMatchObject({ status: 401, title: 'Unauthorized' });
      expect(body.traceId).toBeDefined();
    });

    it('rejects invalid credentials with 401 (no enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'author', password: 'wrong' })
        .expect(401);
    });

    it('rejects malformed login payloads with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'author', password: 'pw', extra: 'nope' })
        .expect(400);
    });

    it('issues a token then authorizes a protected probe (200)', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .get('/api/_probe')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toMatchObject({ username: 'author', roles: ['Author'] });
    });
  });

  describe('RBAC on /api/_probe/admin', () => {
    it('forbids an Author token with 403', async () => {
      const token = await login('author', 'author-pw');
      const res = await request(app.getHttpServer())
        .get('/api/_probe/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body).toMatchObject({ status: 403, title: 'Forbidden' });
    });

    it('allows an Admin token with 200', async () => {
      const token = await login('admin', 'admin-pw');
      const res = await request(app.getHttpServer())
        .get('/api/_probe/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toMatchObject({ message: 'admin access granted' });
    });

    it('allows a multi-role lead token with 200', async () => {
      const token = await login('lead', 'lead-pw');
      await request(app.getHttpServer())
        .get('/api/_probe/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
