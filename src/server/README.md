# IAW Validation & Decision Framework — Node Server (N0)

NestJS + TypeScript backend that replaces the legacy .NET stack. This is the
**N0 foundation**: configuration, database wiring, authentication + RBAC,
health, and cross-cutting concerns. Domain modules (entity registry, engine,
etc.) are added later.

Runs on **port 4000** so it coexists with the legacy .NET API (port 5044).

## Stack

- **NestJS 11** (TypeScript, `strict: true`)
- **Prisma 6** + PostgreSQL (database `iawnode` on `localhost:5433`)
- **@nestjs/jwt** for signed JWT auth, global guards for RBAC
- **nestjs-pino** for structured, secret-redacting logs
- **@nestjs/swagger** OpenAPI docs at `/swagger`
- **Jest + supertest** for unit + e2e tests

## Prerequisites

- Node ≥ 20 (developed on Node 24), npm 11
- PostgreSQL reachable at the `DATABASE_URL` in `.env`
  (docker: `iaw-postgres`, host port `5433`, database `iawnode`, user/pass `iaw`/`iaw`)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file (gitignored) from the template
cp .env.example .env
#    then fill in DATABASE_URL, a strong JWT_SECRET, and OPENAI_* values

# 3. Apply database migrations (creates tables in iawnode)
npx prisma migrate dev

# 4. Run in watch mode
npm run start:dev
```

## Environment

`.env` is **gitignored** (also covered by the repo-root `.gitignore`).
Never commit real secrets — commit only `.env.example`.

| Variable          | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `NODE_ENV`        | `development` \| `production`                        |
| `PORT`            | HTTP port (default `4000`)                           |
| `DATABASE_URL`    | PostgreSQL connection string (required)              |
| `JWT_SECRET`      | JWT signing secret (**required in production**)      |
| `JWT_EXPIRES_IN`  | Token lifetime, e.g. `1h`                            |
| `CORS_ORIGINS`    | Comma-separated allowed browser origins              |
| `OPENAI_ENABLED`  | When `true`, `OPENAI_API_KEY` is required at startup |
| `OPENAI_API_KEY`  | OpenAI key (secret — never logged)                   |
| `OPENAI_MODEL`    | e.g. `gpt-4.1`                                        |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint                           |

Startup **fails fast** if `DATABASE_URL` is missing, or if `JWT_SECRET` is
missing/weak while `NODE_ENV=production`.

## Authentication & RBAC

`POST /api/auth/login` validates credentials against a **dev-only** user store
and returns a signed JWT. Roles: `Author`, `Reviewer`, `Admin`.

| Username   | Password      | Roles                      |
| ---------- | ------------- | -------------------------- |
| `author`   | `author-pw`   | Author                     |
| `reviewer` | `reviewer-pw` | Reviewer                   |
| `admin`    | `admin-pw`    | Admin                      |
| `lead`     | `lead-pw`     | Author, Reviewer, Admin    |

A global `JwtAuthGuard` protects every route except those marked `@Public()`
(`/health`, `/api/auth/login`, Swagger). A global `RolesGuard` enforces
`@Roles(...)`. Inject the principal with `@CurrentUser()`.

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin-pw"}' | jq -r .accessToken)

curl localhost:4000/api/_probe -H "Authorization: Bearer $TOKEN"
```

> `GET /api/_probe` (any auth) and `GET /api/_probe/admin` (Admin only) are
> **throwaway** endpoints that exist purely to exercise the guards. Remove the
> `ProbeModule` once real feature controllers land.

## Endpoints

| Method | Path               | Access        | Notes                          |
| ------ | ------------------ | ------------- | ------------------------------ |
| GET    | `/health`          | Public        | DB liveness via `SELECT 1`     |
| POST   | `/api/auth/login`  | Public        | Returns a JWT                  |
| GET    | `/api/_probe`      | Authenticated | Throwaway guard probe          |
| GET    | `/api/_probe/admin`| Admin         | Throwaway role probe           |
| GET    | `/swagger`         | Public        | OpenAPI UI (Bearer auth)       |

## Cross-cutting concerns

- **Errors** → RFC 7807 `application/problem+json` (`{type,title,status,detail,traceId}`).
  Stack traces and internal details are never returned to clients.
- **Validation** → global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`,
  `transform`) with `class-validator` DTOs.
- **Logging** → structured pino logs; `Authorization`, cookies, passwords,
  tokens, API keys, and secrets are redacted. PHI is never logged.
- **CORS** → allows `http://localhost:5173` (configurable via `CORS_ORIGINS`).

## Scripts

```bash
npm run start:dev        # watch mode
npm run build            # compile to dist/
npm test                 # unit + e2e (requires a reachable DB for e2e)
npm run test:cov         # coverage
npm run lint             # eslint
npx prisma migrate dev   # apply/author migrations
npm run prisma:studio    # browse the DB
```

## Project structure

```
src/
  main.ts                       # bootstrap: pino logger, validation, filters, CORS, swagger
  app.module.ts                 # composition root + global guards
  config/
    configuration.ts            # typed config from env
    env.validation.ts           # fail-fast env validation
  common/
    filters/problem-details.filter.ts   # RFC 7807 error responses
    logging/logger.config.ts            # pino config + redaction
  prisma/
    prisma.module.ts            # @Global Prisma module
    prisma.service.ts           # client lifecycle + isHealthy()
  auth/
    auth.module.ts auth.service.ts auth.controller.ts
    dev-users.ts                # dev-only user store (hashed, constant-time)
    roles.enum.ts auth.types.ts
    dto/                        # login DTOs
    decorators/                 # @Public, @Roles, @CurrentUser
    guards/                     # JwtAuthGuard, RolesGuard
  health/                       # GET /health
  probe/                        # THROWAWAY guard-exercising endpoints
prisma/
  schema.prisma                 # HealthPing placeholder model
  migrations/
test/
  app.e2e-spec.ts               # health + auth + RBAC e2e
```
