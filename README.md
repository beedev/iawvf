# IAW Validation & Decision Framework (VDF)

> A deterministic, configuration-driven clinical rule engine. **The framework decides; the host
> application acts.** Natural-language authoring is a compile-time convenience — at runtime, every
> decision is made from versioned, effective-dated rule definitions evaluated against a fact document,
> with a complete, replayable decision trace.

> **Note:** The original .NET 8 implementation is being **retired** in favor of the Node/NestJS stack
> documented here. This is the canonical, supported implementation going forward.

## What the VDF is — the elevator pitch

Clinical order processing is governed by hundreds of business and lab rules ("if the client is
NY-regulated, the performing lab must be NY-validated"; "Bone Marrow specimens without a body site get
one stamped"; "CAP-governed tests with fixation time outside the window route to medical review"). Hard-
coding these into an application makes them invisible, untestable, and impossible to audit.

The VDF inverts that. Rules are **data** — JSON definitions stored in Postgres, versioned and effective-
dated. The engine is a pure function: given a *fact document* and an *as-of* instant, it selects the
active rules, evaluates each one, and emits a set of **outcomes** plus a per-rule **decision trace**.
The engine never performs side effects; it returns *what should happen*. The host application acts on
those outcomes (place a hold, route to a queue, create a placeholder specimen).

The entity registry is the **bottom-up source of truth**: entities are the nouns (classes) of the
domain and fields are their typed properties. Rules are authored, validated, and evaluated against this
registry vocabulary — nothing references a subject or value that the registry does not define.

Three properties are non-negotiable and are guaranteed by construction:

- **Deterministic** — same facts + same rules + same as-of instant ⇒ identical outcomes and trace.
  Time enters only through a `Clock`, so evaluation is fully reproducible and testable.
- **Explainable** — every evaluated rule contributes a `DecisionTrace` (did it apply? did the assertion
  hold? which leaf conditions, with what subjects/values? what outcome was produced?).
- **Auditable** — rules carry full provenance (the natural-language source, who authored/approved,
  interpreter version, effective window). Decision traces are persisted append-only.

Natural-language authoring (via an LLM interpreter) exists **only at authoring time**: it translates
English into a candidate rule expressed in the controlled vocabulary, which is then linted, paraphrased
back for human confirmation, dry-run against fixtures, and governed (versioned/approved/effective-dated).
The LLM is **never** in the runtime decision path — every runtime decision is deterministic and
config-driven.

## Architecture — modules & responsibilities

The backend is a NestJS application at `src/server`. It is organized into feature modules, each owning a
single responsibility. The frontend is a React + Vite SPA at `src/frontend`, repointed at the Node API
on port `4000`.

| Module | Responsibility |
|---|---|
| **registry** (`RegistryModule`) | The entity registry — the bottom-up source of truth. Canonical entities/fields, fact validation via **Ajv**, and vocabulary projection consumed by authoring and the LLM. Seeded canonical entities: `order`, `test`, `specimen`, `patient`, `document`, `incident`, `medicalReview`, `priorTimepoint`. |
| **vdf** (`VdfEngine`, the `vdf-engine`) | The pure deterministic engine. Pipeline: **select → evaluate** (`appliesWhen` / `assert` / `onSuccess` / `recover` / `onFailure`) **→ derive** (write-back for rule chaining) **→ dispatch → outcomes + traces + `factsAfter`**. No side effects. |
| **rules** | Postgres-backed persistence. Versioned, effective-dated rule storage (`RuleRepository`), the engine-over-DB evaluation path (`RuleEvaluationService`), the reference-data provider for reference-backed operators, and the append-only decision-trace store. |
| **authoring** | Compile-time authoring tooling: vocabulary linter, schema validator, deterministic round-trip paraphraser, and dry-run previewer. No runtime evaluation role. |
| **llm** | The OpenAI rule interpreter (compile-time NL → candidate rule), grounded on the **live registry vocabulary**, with an offline stub fallback. Output is always validated by a deterministic gate (schema + registry lint) before it can be governed. |
| **api** | Controllers exposing the surface: auth/login, registry, rules governance, authoring, evaluate, and health. |

### Stack

- **NestJS 11** — application framework and dependency injection.
- **Prisma 6 + PostgreSQL** — versioned, effective-dated rule storage and append-only trace persistence.
- **Ajv** — fact-document validation against registry schemas.
- **class-validator** — request DTO validation.
- **pino** — structured, redacted logging.
- **JWT auth + RBAC** — authentication and role-based authorization.
- **Frontend** — React + Vite SPA (`src/frontend`), pointed at the Node API on `:4000`.

The engine entry point evaluates an `EvaluationRequest` and returns an `EvaluationResult`
(`outcomes`, `trace`, `factsAfter`).

## How to run

Prerequisites: Node, npm, Docker.

```bash
# 1. Postgres — container iaw-postgres on localhost:5433
docker compose up -d db

# 2. Backend — NestJS API on http://localhost:4000 (Swagger at /swagger)
cd src/server
npm install
npx prisma migrate dev
npm run start:dev

# 3. Frontend — Vite dev server on http://localhost:5173
cd src/frontend
npm install
npm run dev
```

### Configuration

Backend config lives in `src/server/.env` (gitignored). Copy `src/server/.env.example` and adjust:

```ini
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://iaw:iaw@localhost:5433/iawnode?schema=public

# Auth — JWT_SECRET is REQUIRED and must be >= 16 chars in production (fail-fast at startup)
JWT_SECRET=change-me-at-least-16-chars
JWT_EXPIRES_IN=1h

# CORS — the frontend origin
CORS_ORIGINS=http://localhost:5173

# LLM interpreter (compile-time only). OPENAI_ENABLED=false falls back to the offline stub.
OPENAI_ENABLED=false
OPENAI_API_KEY=sk-...your-key...
OPENAI_MODEL=gpt-4.1
OPENAI_BASE_URL=https://api.openai.com/v1
```

With `OPENAI_ENABLED=false`, the **llm** module uses the offline stub interpreter — no external calls,
fully deterministic for development and tests.

### Dev login credentials

Authenticate via `POST /api/auth/login` to receive a Bearer token. These accounts are **DEV-ONLY
scaffolding** and must not be used outside local development:

| Username | Password | Roles |
|---|---|---|
| `author` | `author-pw` | Author |
| `reviewer` | `reviewer-pw` | Reviewer |
| `admin` | `admin-pw` | Admin |
| `lead` | `lead-pw` | Author, Reviewer, Admin |

## Rule anatomy

Every rule has a four-part shape — **WHEN / DECISION / ON SUCCESS / ON FAILURE** — plus an optional
recovery step:

- **WHEN (`appliesWhen`)** — the applicability gate. Decides whether the rule applies at all. **Absent ⇒
  always applies.**
- **DECISION (`assert`)** — the condition that must hold. **Absent is treated as failing through to
  `onFailure`** — the pattern derivation rules use to always stamp a value.
- **ON SUCCESS (`onSuccess`)** — the outcome produced when `assert` holds (usually `Continue`).
- **RECOVER (`recover`, optional)** — a recovery strategy attempted on `assert` failure, before
  `onFailure` is produced.
- **ON FAILURE (`onFailure`)** — the outcome produced when `assert` fails (and recovery, if any, does
  not succeed).

Rules run in **phase** order — **Derive → Validate → Route** — then by `priority`, then by `key`. Phase
ordering ensures derivations stamp facts that later phases can read.

### The six operator families

Conditions are leaves (`subject operator value|reference`) combined into trees. A leaf may carry a
quantifier over a collection — `This` (scalar), `Any`, or `Every`. The operators group into six families:

1. **Presence** — `IsPresent`, `IsAbsent`
2. **Equality** — `Equals`, `NotEquals`
3. **Membership** — `InSet`, `NotInSet`
4. **Comparison** — `GreaterThan`, `LessThan`, `GreaterOrEqual`, `LessOrEqual`, `WithinRange`
5. **Matching** — `Matches`, `IsCompatibleWith` (may be reference-backed)
6. **Reference-eligibility** (reference-backed) — `IsEligibleFor`, `Exists`

### The five outcome groups

Every produced outcome belongs to one of five business effect groups (plus a neutral `None` group for
control flow):

| Group | Outcome types | Effect |
|---|---|---|
| **Validation** | `CompleteHold`, `PartialHold`, `Warning`, `ComplianceAlert` | Block or flag an order/test/specimen. |
| **Workflow** | `RouteToReview`, `RouteToQueue`, `Escalate` | Route work to a human/queue. |
| **Derivation** | `SetValue`, `ApplyDefault`, `CalculateValue` | Write a value back into facts for rule chaining. |
| **Entity** | `CreatePlaceholder`, `CreateIncident`, `CreateTask` | Materialize a new entity. |
| **Control** | `PreventAction`, `AllowAction` | Gate an action. |
| *(None)* | `Continue`, `Suppressed` | No business effect / control flow. |

## Verification summary

The Node stack is verified end to end:

| Check | Result |
|---|---|
| Server build / lint | clean |
| Server tests | **227 passing** (1 gated live-OpenAI smoke test skipped) |
| Frontend tests | **72 passing** |
| Dependency scan (`npm audit`) | **0 high / 0 critical** |
| Engine performance | **140 rules** evaluated against a fact document in **~0.27 ms** warm median (SLA 50 ms) |
