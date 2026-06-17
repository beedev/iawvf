# IAW — Intelligent Accessioning Workbench: Build Plan

**Program:** E2E Accessioning Automation (IAW) for NeoGenomics
**Goal:** Deliver the entire functionality as a runnable system — .NET backend, React frontend, PostgreSQL DB — with in-process mock services + seeded data standing in for external systems.
**Strategy (approved):** Vertical slice first → then expand. Mocks = in-process adapter services + seeded Postgres data.
**Source of truth:** `docs/00_SOURCE_REQUIREMENTS.md` (270 FRs, 10 domains) + VDF spec + NL Authoring HLD + Vocabulary Coverage findings + 20-wk WBS.

---

## 1. Architecture (target)

```
React 18 + TS + Vite + Fluent UI v9         ← Experience layer (Worklist, Accessioning,
        │  (REST + SignalR realtime)            Incident Workspace, Rule Authoring, Dashboards)
        ▼
ASP.NET Core 8 Web API (Clean Architecture)
  ├── IAW.Api            (controllers, SignalR hubs, auth)
  ├── IAW.Application    (use-cases, CQRS handlers, DTOs)
  ├── IAW.Domain         (entities, value objects, lifecycle/workflow)
  ├── IAW.Vdf            (★ Validation & Decision Framework — the decision core)
  ├── IAW.Infrastructure (EF Core, repositories, outbox, SignalR)
  └── IAW.Integrations   (mock adapters: NeoLINK, Salesforce, NeoLIMS,
                          OCR/IDP, PatientMaster, TestCompendium)
        ▼
PostgreSQL (EF Core migrations) — Order, Test, Specimen, Patient, Client, Provider,
        Document, Hold/Incident, Audit, Rule, RuleVersion, ReferenceData, Outbox
```

**Governing principle (from VDF spec):** *The framework decides; the application acts.* No business
rules hard-coded in services — all validation/derivation/routing/hold logic lives in the versioned
VDF rule repository. Runtime is deterministic (no AI in the decision path); NL authoring is compile-time only.

**Tech defaults (state-and-proceed):** .NET 8 LTS, EF Core 8 + Npgsql, ASP.NET Core Identity (JWT, SSO-stub
for SA1), React 18 + TypeScript + Vite + Fluent UI v9 + TanStack Query + SignalR client. Docker Compose
for Postgres. xUnit + FluentAssertions (backend), Vitest + Playwright (frontend/E2E).

---

## 2. BRD set (deliverable — one per capability domain)

Written to `docs/brd/`. Each BRD: Purpose → Business value → In-scope FR/TR IDs → User stories →
Acceptance criteria → VDF rules involved → External dependencies (mocked) → Out-of-scope/Future.

| # | BRD | Source FR groups |
|---|-----|------------------|
| BRD-01 | Intake & Ingestion | I1–I9 |
| BRD-02 | Order Worklist & Prioritization | OW1–OW5 |
| BRD-03 | Order Architecture & Accessioning | OA1–OA19 |
| BRD-04 | Specimen Receipt & Verification | SR1–SR8 |
| BRD-05 | Order Entry & Submission | OE1–OE39 |
| BRD-06 | Validation & Decision Framework (★ core) | VDF spec + BL/PM rule corpus |
| BRD-07 | Problem Management & Action (Holds/Incidents) | PM1–PM49 |
| BRD-08 | Business Logic & Derivations | BL1–BL52 |
| BRD-09 | Add-Ons, Reflex & Predictive | A1–A12 |
| BRD-10 | Outbound Integrations & Sync | I4, I5, I8 + outbound |
| BRD-11 | Rule Authoring (NL Copilot) & Governance | NL Authoring HLD |
| BRD-12 | Leadership Analytics & Dashboards | LD1–LD4 |
| BRD-13 | Security, Identity & Non-Functional | SA1–SA5 |

A master traceability matrix (`docs/brd/TRACEABILITY.md`) maps every FR/TR → BRD → MVP → component → test.

---

## 3. MVP decomposition & tracking

Each MVP is tracked to closure with: scope (FR IDs), build tasks, **verification evidence** (tests pass +
runnable demo), and a HANDOFF note. Progress lives in `tasks/progress.md` + the orchestrate manifest.

**MVP-0 — Foundation & Platform**
Solution scaffold (6 projects), Postgres + EF Core schema & migrations, Docker Compose, auth/RBAC baseline,
React scaffold + Fluent UI shell + routing, shared libs (logging, error handling, audit, outbox), seed/mock
data generator. *Exit:* `dotnet run` + `npm run dev` boot; health checks green; DB seeded.

**MVP-1 — VDF Decision Core (★ the heart)** — `BRD-06`
Fact assembly, rule repository (versioned/effective-dated), trigger engine, rule selector + dependency
ordering, decision evaluator (WHEN/DECISION/ON SUCCESS/ON FAILURE), outcome dispatcher (5 groups),
reconciler, explainability/decision-trace. Rule schema + closed vocabulary catalog. *Exit:* unit + rule
regression harness green; the 10 reference rules from the Translation Reference evaluate correctly with traces.

**MVP-2 — End-to-end Vertical Slice** (proves the architecture)
intake (mock NeoLINK) → Order Worklist → accession → VDF evaluates → Complete/Partial Hold created →
Incident workspace → resolve → release-from-hold → reconciler closes. Wires Core Domain + Worklist +
a thin Accessioning + PM + 3–4 real rules (PM17, PM48, BL3, BL27) end to end. *Exit:* Playwright E2E walks
the full happy + hold-and-resolve path against seeded data.

**MVP-3 — Core Domain & Order Worklist (full)** — `BRD-02, BRD-03`
Order/Test/Specimen/Patient/Client/Provider services + APIs, workflow/lifecycle engine, audit, unified
worklist (filter/sort/search/realtime/RBAC), priority (STAT>RUSH>Ped>Routine) + 90-day aging, Order
Architecture UI (multi-test/specimen, draft, override).

**MVP-4 — Accessioning, Order Entry & Specimen Receipt** — `BRD-03, BRD-04, BRD-05`
Release online/interfaced + auto-submit, draft/activate, NPI validation + TCP routing, specimen receipt
verification, patient resolution/dedup, duplicate-test detection, Interop hybrid reconciliation.

**MVP-5 — Problem Management & Action (full)** — `BRD-07`
Incident & hold engine (all 30+ PM scenarios), hold queue + prioritization UI, incident workspace,
notification & escalation framework, routing (review/medical/sendout), client resolution workflow + audit.

**MVP-6 — Business Logic rule corpus (full)** — `BRD-08`
Author + test ~130 VDF rules (BL1–52, PM1–49) as configuration via the rule repository, including the
extension-point cases (time triggers, cross-entity, multi-record) and the 8 documented exceptions.

**MVP-7 — Intake & Ingestion (full)** — `BRD-01`
Mock NeoLINK (online OO1.0/2.0 + interfaced), OCR/IDP pipeline mock (confidence/draft), manual TRF screen,
Patient Master mock, intake normalization + TC code translation.

**MVP-8 — Outbound Integrations & Sync** — `BRD-10`
Mock Salesforce bi-directional (PM events out, add-on/resolution events in via async callbacks), NeoLIMS
specimen events (subscribe), Billing/PA workflow mock, downstream notification framework.

**MVP-9 — Add-Ons, Reflex & Predictive** — `BRD-09`
Add-on ingestion (client + pathologist), add-on worklist + feasibility (Eligible/NotEligible/Review),
reflex shells + auto-activate/close, predictive add-on recommendations + Pending Approval gate.

**MVP-10 — Rule Authoring NL Copilot & Governance** — `BRD-11`
NL interpreter (constrained NL→structured rule, schema-bound), vocabulary linter + round-trip paraphrase +
dry-run previewer, authoring UI + governance (review/approve/effective-date/promote), provenance store.

**MVP-11 — Leadership Analytics & Dashboards** — `BRD-12`
Hold metrics (type/category/status/aging), resolution-time, throughput/bottlenecks, trend & anomaly,
leadership dashboard with filters.

**MVP-12 — Quality, Security & Hardening** — `BRD-13`
RBAC hardening + SSO stub, performance/load pass against SLA targets, security review, full regression +
E2E suite, docs (API contracts, runbooks, user guide).

---

## 4. Execution method (orchestrate skills, per request)

1. Run `orchestrate:init` to lay down project memory (manifest, bootstrap, progress log) under `IAW/`.
2. Drive each MVP through the orchestrate **greenfield/feature** lane: module-design gate → build →
   verify → checkpoint. Use subagents (frontend, backend, vdf/rules, qa) for parallel build, keeping the
   main thread as orchestrator/integrator.
3. **Approval gates (BHARATH):** module design before new modules; demonstrate working code before
   marking an MVP closed; no commits unless you ask.
4. **Closure definition per MVP:** code complete + unit/integration tests green + a runnable demo path
   (Playwright E2E or documented manual walkthrough) + HANDOFF note + traceability matrix updated.

---

## 5. First actions on approval

1. `orchestrate:init` → project memory.
2. Write the 13 BRDs + traceability matrix to `docs/brd/`.
3. Build **MVP-0** (scaffold, schema, seed) → verify boot.
4. Build **MVP-1** (VDF core) → verify rule regression harness.
5. Build **MVP-2** (vertical slice) → Playwright E2E proving end-to-end.
6. Then expand MVP-3 … MVP-12, tracking each to closure.

## Review section
_(to be completed as MVPs close)_
