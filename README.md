# IAW Validation & Decision Framework (VDF)

> A deterministic, configuration-driven clinical rule engine. **The framework decides; the host
> application acts.** Natural-language authoring is a compile-time convenience — at runtime, every
> decision is made from versioned, effective-dated rule definitions evaluated against a fact document,
> with a complete, replayable decision trace.

## What the VDF is — the elevator pitch

Clinical order processing is governed by hundreds of business and lab rules ("if the client is
NY-regulated, the performing lab must be NY-validated"; "Bone Marrow specimens without a body site get
one stamped"; "CAP-governed tests with fixation time outside the window route to medical review"). Hard-
coding these into an application makes them invisible, untestable, and impossible to audit.

The VDF inverts that. Rules are **data** — JSON definitions stored in Postgres, versioned and effective-
dated. The engine is a pure function: given a *fact document* and an *as-of* instant, it selects the
active rules, evaluates each one, and emits a set of **outcomes** plus a per-rule **decision trace**.
The engine never performs side effects; it returns *what should happen*. The host application supplies
`IOutcomeHandler`s that act on those outcomes (place a hold, route to a queue, create a placeholder
specimen).

Three properties are non-negotiable and are guaranteed by construction:

- **Deterministic** — same facts + same rules + same as-of instant ⇒ identical outcomes and trace.
  Time enters only through `IClock`, so evaluation is fully reproducible and testable.
- **Explainable** — every evaluated rule contributes a `DecisionTrace` (did it apply? did the assertion
  hold? which leaf conditions, with what subjects/values? what outcome was produced?).
- **Auditable** — rules carry full provenance (the natural-language source, who authored/approved,
  interpreter version, effective window). Decision traces are persisted append-only.

Natural-language authoring (via an LLM interpreter) exists **only at authoring time**: it translates
English into a candidate rule expressed in the controlled vocabulary, which is then linted, paraphrased
back for human confirmation, dry-run against fixtures, and governed (versioned/approved/effective-dated).
The LLM is never in the runtime evaluation path.

## Architecture — projects & responsibilities

The backend is a .NET 8 solution (`src/backend/IAW.Vdf.sln`) layered around an abstractions/contracts
project so a host embeds only what it needs.

| Project | Responsibility |
|---|---|
| **IAW.Vdf.Abstractions** | The contract layer: `RuleDefinition`, `FactDocument`, `Outcome`, condition model, and the six **integration seams** (below). No logic — pure contracts. Everything depends on this; it depends on nothing. |
| **IAW.Vdf.Core** | The engine. `VdfEngine` (the `IRuleEvaluator`), `RuleSelector` (phase/priority/effective-date ordering), `OperatorEvaluator`/`OperatorSemantics`, the `Reconciler` (resolves competing outcomes), the JSON serializer, and in-memory default providers. |
| **IAW.Vdf.Persistence** | EF Core + Postgres adapter. `VdfDbContext`, EF-backed `IRuleRepository`/`IReferenceDataProvider`, append-only decision-trace store, corpus importer. Versioned, effective-dated rule storage. |
| **IAW.Vdf.Authoring** | Compile-time authoring tooling: `SchemaValidator`, `VocabularyLinter`, `RoundTripParaphraser`, `DryRunPreviewer`. No runtime evaluation role. |
| **IAW.Vdf.Authoring.Llm** | The OpenAI-backed `IRuleInterpreter` (NL → candidate rule) plus an offline deterministic stub for tests. |
| **IAW.Vdf.Api** | ASP.NET Core API: auth (JWT), rule governance, authoring endpoints, evaluation endpoint, health checks. Wires all the above via DI. |
| **IAW.Vdf.Demo** | A runnable, deterministic harness that evaluates the committed corpus against fixture scenarios — the canonical "how to embed the engine" example. |
| **src/frontend** | React + TypeScript + Fluent UI authoring/console SPA (Vite). |

### The integration seams

A host customizes the framework by implementing these interfaces (all in `IAW.Vdf.Abstractions`).
Sensible defaults are registered by `AddVdfCore()`; the host overrides what it needs.

| Seam | Purpose | Default |
|---|---|---|
| `IRuleRepository` | Supplies the active rule definitions for an as-of instant. | In-memory (Core) → Postgres (Persistence). |
| `IFactProvider` | Assembles the `FactDocument` for a trigger from the host's domain. | Pass-through (facts supplied directly). |
| `IReferenceDataProvider` | Resolves reference data (thresholds, compatibility/eligibility tables) by key for reference-backed operators. | In-memory (Core) → Postgres/JSON. |
| `IOutcomeHandler` | Acts on a produced outcome (the side-effect boundary). | None — host supplies. |
| `IClock` | Supplies "now" so evaluation is deterministic. | `SystemClock`; tests use `FixedClock`. |
| `IRuleInterpreter` | Authoring-time NL → candidate rule. | OpenAI interpreter or offline stub. |

The engine entry point is `IRuleEvaluator.EvaluateAsync(EvaluationRequest)` → `EvaluationResult`
(`Outcomes`, `Trace`, `FactsAfter`).

## Rule anatomy

Every rule has a four-part shape — **WHEN / DECISION / ON SUCCESS / ON FAILURE** — plus an optional
recovery step. As JSON (abbreviated from `rules/BL8.json`):

```json
{
  "key": "BL8",
  "name": "NY-regulated order requires NY-validated performing lab",
  "priority": 30,
  "phase": "Validate",
  "appliesWhen": { "type": "leaf", "subject": "order.client.nyStatus",
                   "operator": "Equals", "value": "NYRegulated" },
  "assert":      { "type": "leaf", "subject": "order.performingLab",
                   "operator": "IsEligibleFor", "reference": "TestCompendium.nyValidation" },
  "onSuccess":   { "type": "Continue" },
  "onFailure":   { "type": "ComplianceAlert", "scope": "order", "severity": "informational",
                   "reason": "Performing lab not on NY-validated list for NY-regulated client" }
}
```

- **WHEN (`appliesWhen`)** — gates whether the rule applies at all. Omitted ⇒ always applies.
- **DECISION (`assert`)** — the condition that must hold. If `null`, the rule "fails through" to
  `onFailure` — the pattern derivation rules use to always stamp a value.
- **ON SUCCESS (`onSuccess`)** — the outcome when `assert` holds (usually `Continue`).
- **ON FAILURE (`onFailure`)** — the outcome when `assert` fails (required).
- **RECOVER (`recover`, optional)** — a `RecoveryStrategy` (e.g. `apply-default`,
  `find-alternate-specimen`) attempted before `onFailure`.

Rules run by **phase** (`Derive` → `Validate` → `Route`), then by `priority` (lower first), then by key —
so derivations stamp facts that later phases can read.

### The six operator families

Conditions are leaves (`subject operator value|reference`) combined into trees with `All` (AND), `Any`
(OR), `Not`. Leaves may carry a quantifier (`This` scalar, `Any` / `Every` over a `[]` collection). The
operators (`OperatorKind`) group into six families:

1. **Presence** — `IsPresent`, `IsAbsent`
2. **Equality** — `Equals`, `NotEquals`
3. **Membership** — `InSet`, `NotInSet`
4. **Comparison** — `GreaterThan`, `LessThan`, `GreaterOrEqual`, `LessOrEqual`, `WithinRange`
5. **Matching** (regex / reference-backed) — `Matches`, `IsCompatibleWith`
6. **Reference-eligibility** (reference-backed) — `IsEligibleFor`, `Exists`

### The five outcome groups

Every `Outcome` has a `Type`, and its `Group` is derived deterministically. The five business effect
groups (plus `None` for control flow) classify what a decision *means*:

| Group | Outcome types | Effect |
|---|---|---|
| **Validation** | `CompleteHold`, `PartialHold`, `Warning`, `ComplianceAlert` | Block or flag an order/test/specimen. |
| **Workflow** | `RouteToReview`, `RouteToQueue`, `Escalate` | Route work to a human/queue. |
| **Derivation** | `SetValue`, `ApplyDefault`, `CalculateValue` | Compute/stamp a fact for downstream rules. |
| **Entity** | `CreatePlaceholder`, `CreateIncident`, `CreateTask` | Materialize a new entity. |
| **Control** | `PreventAction`, `AllowAction` | Gate an action. |
| *(None)* | `Continue`, `Suppressed` | No business effect / control flow. |

## Running locally

Prerequisites: .NET 8 SDK, Node 18+, Docker. Put `~/.dotnet/tools` on your `PATH` for `dotnet ef`.

```bash
# 1. Postgres (localhost:5433, db/user/pass = iaw)
docker compose up -d db

# 2. API (http://localhost:5044, Swagger at /swagger in Development)
export PATH="$PATH:$HOME/.dotnet/tools"
dotnet run --project src/backend/IAW.Vdf.Api

# 3. UI (http://localhost:5173)
cd src/frontend && npm install && npm run dev
```

### Configuration

- **Backend `.env`** (repo root; copy from `.env.example`, gitignored). Loaded for local development;
  real environment variables and `appsettings` always win. Controls the OpenAI interpreter:

  ```ini
  OPENAI_ENABLED=true
  OPENAI_API_KEY=sk-...your-key...
  OPENAI_MODEL=gpt-4.1
  OPENAI_BASE_URL=https://api.openai.com/v1
  ```

- **JWT signing key** — `Jwt:Key`. In **Development** a deterministic dev key is supplied automatically
  (and the real dev key lives in `appsettings.Development.json`). In **any non-Development environment
  the key is required**: a missing key is a clear **fail-fast at startup**, never a per-request 500.
  Supply it via env var (`Jwt__Key=...`) or a secret store.

- **Frontend `.env`** (`src/frontend/.env`, copy from `.env.example`):

  ```ini
  VITE_API_BASE_URL=http://localhost:5044
  ```

The API's CORS allows the UI origin `http://localhost:5173` by default
(`Cors:AllowedOrigins`).

## Test & verification summary

All suites are green (see `docs/ARCHITECTURE.md` for the determinism/auditability guarantees they prove).

| Suite | Command | Result |
|---|---|---|
| Backend unit | `dotnet test tests/IAW.Vdf.Tests` | **147 passed**, 1 skipped (gated live-OpenAI smoke) |
| Backend integration (Postgres) | `dotnet test tests/IAW.Vdf.IntegrationTests` | **10 passed** |
| API (WebApplicationFactory + Postgres) | `dotnet test tests/IAW.Vdf.ApiTests` | **16 passed** |
| Frontend | `cd src/frontend && npm test` | **9 passed** |
| Frontend build / lint | `npm run build && npm run lint` | clean |

Hardening verifications:

- **Build**: `dotnet build src/backend/IAW.Vdf.sln` → **0 warnings, 0 errors** (EF Core / Npgsql
  packages pinned to a single consistent 8.0.x set).
- **Dependency scan**: `dotnet list package --vulnerable --include-transitive` → **0 vulnerable**;
  `npm audit --audit-level=high` → **0 vulnerabilities**.
- **Performance SLA**: a single evaluation over **112 synthesized corpus rules** completes in **~0.6 ms**
  (SLA < 200 ms) — see `tests/IAW.Vdf.Tests/PerformanceTests.cs`.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, the evaluation pipeline, the persistence
  model, the authoring loop, and how determinism/explainability/auditability are guaranteed.
- [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md) — how a host .NET app embeds the VDF.
- [`docs/RULE_AUTHORING_GUIDE.md`](docs/RULE_AUTHORING_GUIDE.md) — authoring a rule in natural language,
  reading the interpretation/gaps, lint/paraphrase/dry-run, and governance.
