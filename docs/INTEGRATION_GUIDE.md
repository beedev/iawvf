# VDF Integration Guide

How a host application integrates with the IAW Validation & Decision Framework (VDF) running as a
**Node/NestJS HTTP service**: how to authenticate, how to assemble the facts you POST, how to act on the
outcomes that come back, and the supporting endpoints for registry and rule governance.

> **The .NET / library-embedding model is retired.** There is no `IAW.Vdf.*` project to reference, no DI
> extension to call, no in-process `IRuleEvaluator`, `IFactProvider`, or `IOutcomeHandler` to implement. The
> VDF is now consumed over REST. The integration boundary is the wire, not your DI container.

## What "integrating" means now

The VDF is an **HTTP service that sits behind your host application.** Your host does three things:

1. **Authenticate** once and carry a bearer token.
2. **Assemble facts** — gather your domain data and shape it into an entity-keyed JSON document.
3. **POST to `/api/evaluate`** and **act on the outcomes** it returns.

The division of labor is unchanged from the old model, only the seam moved:

> **The framework DECIDES. The host ACTS.**

The service returns *outcomes* (advisory decisions) plus a *trace* (explainability) plus the *post-run
facts*. It never places a hold, routes an order, or creates a record on your behalf — your own code does
that in response to the outcomes.

Two host-side responsibilities carry over from the retired `IFactProvider` / `IOutcomeHandler` seams, but
they are now plain application code rather than interfaces you register:

| Old in-process seam | New host responsibility |
|---|---|
| `IFactProvider.AssembleAsync` | A **fact assembler**: your code builds the entity-keyed JSON and POSTs it. |
| `IOutcomeHandler.HandleAsync` | **Outcome handling**: your code reads the returned outcomes and performs the real-world effect. |

**Natural-language authoring is compile-time only.** Rules are authored (and optionally drafted from natural
language) ahead of time and stored in Postgres. The LLM is **never** in the runtime path — `/api/evaluate`
runs a deterministic engine over the stored, approved rules. A given `(rules, facts)` pair always yields the
same outcomes and trace.

Base URL for local development: `http://localhost:4000`.

---

## 1. Authentication

Obtain a JWT bearer token, then send it on every other call.

### `POST /api/auth/login`

Request body:

```json
{ "username": "author", "password": "author-pw" }
```

Response (`200 OK`):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "username": "author",
  "roles": ["Author"]
}
```

curl:

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"author","password":"author-pw"}'
```

Send the token on every subsequent request:

```
Authorization: Bearer <accessToken>
```

Invalid credentials return `401`. `expiresIn` is the token lifetime in seconds; re-authenticate before it
elapses.

### Development credentials

These accounts exist **for local development only.** In production the service authenticates against a real
identity provider (IdP) — the username/password flow above is replaced, but the bearer-token contract and
roles are the same.

| Username   | Password      | Role     | Can do |
|------------|---------------|----------|--------|
| `author`   | `author-pw`   | Author   | Create rules / add rule versions |
| `reviewer` | `reviewer-pw` | Reviewer | Approve rules |
| `admin`    | `admin-pw`    | Admin    | Promote / disable rules, edit the registry |
| `lead`     | `lead-pw`     | Lead     | Elevated read / oversight |

> **Do not ship these credentials.** They are seeded for the dev environment and have no meaning against a
> production IdP.

---

## 2. The runtime path — `POST /api/evaluate`

This is the call your host makes on its hot path. It is open to **any authenticated principal** (no special
role required). The service validates the facts against the registry, runs the active rule set, persists an
audit trace, and returns the decision.

### Request — `EvaluateRequestDto`

| Field         | Type     | Required | Meaning |
|---------------|----------|----------|---------|
| `factsJson`   | object   | yes      | The entity-keyed fact document to evaluate (see [§4](#4-the-fact-assembler-host-responsibility)). |
| `ruleSet`     | string   | no       | Optional rule-set filter. Omit to evaluate against **all** active rules. |
| `triggerType` | enum     | no       | `OrderEvent` \| `TimeSchedule` \| `DecisionReturned`. Defaults to `OrderEvent`. |
| `strict`      | boolean  | no       | When `true`, a registry-validation failure **blocks** evaluation with `422`. Default `false`: outcomes are returned **alongside** a validation block so the UI can surface fact/registry mismatches without losing the decision. |

### Response — `EvaluateResponseDto`

```jsonc
{
  "outcomes": [
    {
      "type": "ComplianceAlert",   // the specific decision
      "group": "Validation",        // Validation | Workflow | Derivation | Entity | Control
      "scope": "order",             // which entity the outcome is about (nullable)
      "reason": "…human-readable…", // why (nullable)
      "severity": "Error",          // nullable
      "parameters": { }             // outcome-specific structured data
    }
  ],
  "trace": [
    {
      "ruleKey": "…",
      "version": 3,
      "phase": "Validation",
      "applied": true,
      "assertResult": false,
      "conditions": [
        {
          "subject": "order.performingLab",
          "operator": "in",
          "resolvedLeft": "Lab-CA-1",
          "resolvedRight": "[NY-validated labs]",
          "result": false
        }
      ],
      "produced": { "type": "ComplianceAlert", "group": "Validation", "...": "..." }
    }
  ],
  "factsAfter": { },          // the fact document after derivation write-backs (object | null)
  "validation": {
    "valid": true,
    "errors": [ { "entity": "specimen", "path": "specimen.fixationTime", "message": "…" } ]
  }
}
```

- **`outcomes`** — the advisory decisions your host acts on, grouped by `group`.
- **`trace`** — one entry per rule the engine considered, with its leaf-condition results. This is the
  explainability / audit record; surface it in review UIs or log it for compliance.
- **`factsAfter`** — the fact document **after** derivation rules wrote their values back. Read derived
  values from here (see [§5](#5-outcome-handling-host-responsibility)).
- **`validation`** — the registry-validation block: `valid` plus a list of entity-/path-scoped errors
  (no PHI). Present even in non-strict mode.

### Full example

Authenticate, then evaluate a clinical fact document:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"author","password":"author-pw"}' | jq -r .accessToken)

curl -s -X POST http://localhost:4000/api/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "triggerType": "OrderEvent",
    "factsJson": {
      "test":     { "code": "FISH-T-001", "name": "FISH HER2" },
      "specimen": { "type": "FFPE", "fixationTime": 24, "bodySite": null },
      "order":    {
        "client": { "nyStatus": "NYRegulated" },
        "performingLab": "Lab-CA-1",
        "type": "Clinical"
      },
      "document": { "requisitionComplete": true }
    }
  }'
```

Sample response:

```json
{
  "outcomes": [
    {
      "type": "ComplianceAlert",
      "group": "Validation",
      "scope": "order",
      "reason": "Performing lab is not on the NY-validated list for an NY-regulated client.",
      "severity": "Error",
      "parameters": { "client.nyStatus": "NYRegulated", "performingLab": "Lab-CA-1" }
    },
    {
      "type": "SetValue",
      "group": "Derivation",
      "scope": "specimen",
      "reason": "Body site derived from test catalog.",
      "severity": null,
      "parameters": { "path": "specimen.bodySite", "value": "Breast" }
    }
  ],
  "trace": [
    {
      "ruleKey": "ny-performing-lab-validation",
      "version": 3,
      "phase": "Validation",
      "applied": true,
      "assertResult": false,
      "conditions": [
        { "subject": "order.client.nyStatus", "operator": "equals",
          "resolvedLeft": "NYRegulated", "resolvedRight": "NYRegulated", "result": true },
        { "subject": "order.performingLab", "operator": "in",
          "resolvedLeft": "Lab-CA-1", "resolvedRight": "[NY-validated labs]", "result": false }
      ],
      "produced": { "type": "ComplianceAlert", "group": "Validation", "scope": "order",
                    "reason": "Performing lab is not on the NY-validated list for an NY-regulated client.",
                    "severity": "Error", "parameters": {} }
    }
  ],
  "factsAfter": {
    "test":     { "code": "FISH-T-001", "name": "FISH HER2" },
    "specimen": { "type": "FFPE", "fixationTime": 24, "bodySite": "Breast" },
    "order":    { "client": { "nyStatus": "NYRegulated" }, "performingLab": "Lab-CA-1", "type": "Clinical" },
    "document": { "requisitionComplete": true }
  },
  "validation": { "valid": true, "errors": [] }
}
```

### Reading outcomes by group, and acting

Your host iterates `outcomes` and routes by `group`. Each group maps to a class of host action:

| `group`      | What it means | Typical host action |
|--------------|---------------|---------------------|
| `Validation` | A correctness / compliance assertion failed | Surface the error, **place a hold**, block release. |
| `Workflow`   | A process step is indicated | **Route to a queue**, request a sign-off, escalate. |
| `Derivation` | A value was computed and written back | Read it from `factsAfter`; no separate action needed. |
| `Entity`     | An entity-level decision (create/flag) | **Create a placeholder**, flag the entity. |
| `Control`    | Engine flow control (e.g. continue/suppress) | Usually informational; rarely needs host action. |

A minimal host dispatch loop:

```ts
for (const o of response.outcomes) {
  switch (o.group) {
    case 'Validation': await workflow.placeHold(o.scope, o.reason); break;
    case 'Workflow':   await queues.route(o.type, o.scope, o.parameters); break;
    case 'Entity':     await entities.flagOrCreate(o.scope, o.parameters); break;
    case 'Derivation': /* value is already in response.factsAfter */ break;
    case 'Control':    /* informational */ break;
  }
}
```

---

## 3. Trigger types

`triggerType` tells the engine *why* it is being asked to decide. It selects which families of rules apply:

- **`OrderEvent`** (default) — an order-lifecycle event (submitted, amended, etc.).
- **`TimeSchedule`** — a scheduled / time-based re-evaluation (e.g. a TAT clock fired).
- **`DecisionReturned`** — a previously-made decision came back (e.g. a reviewer responded), prompting a
  re-decision.

Set it to match the situation that prompted the call; leave it unset for ordinary order events.

---

## 4. The fact assembler (host responsibility)

This is the `IFactProvider` equivalent. Instead of implementing an in-process interface, your host **gathers
its domain data and shapes it into the entity-keyed JSON document** you place in `factsJson`.

- **Entity-keyed.** The top-level keys are registry **entity** keys (`test`, `specimen`, `order`,
  `document`, `patient`, …). Each entity's properties match the **fields** the registry defines for it.
- **Match the vocabulary.** Keys and field names must match the registry. Use
  `GET /api/registry/vocabulary` to discover the active entities/fields, their data types, and allowed
  values, then shape your document accordingly. Mismatches show up in the `validation` block (and block
  evaluation under `strict: true`).
- **Project, don't dump.** Include the fields the rules reference. Extra keys are tolerated by the engine,
  but unknown entities/fields surface as validation findings.

A typical assembler loads your aggregate(s) and projects the relevant fields:

```ts
function assembleFacts(order: Order): Record<string, unknown> {
  return {
    test:     { code: order.test.code, name: order.test.name },
    specimen: { type: order.specimen.type, fixationTime: order.specimen.fixationHours },
    order:    {
      client: { nyStatus: order.client.nyStatus },
      performingLab: order.performingLab,
      type: order.type,
    },
    document: { requisitionComplete: order.requisition.isComplete },
  };
}
```

Validate the shape *before* evaluating (optional but cheap): `POST /api/registry/validate` (see
[§6](#6-supporting-endpoints)). On the hot path, prefer non-strict `/api/evaluate` and read the returned
`validation` block.

---

## 5. Outcome handling (host responsibility)

This is the `IOutcomeHandler` equivalent. Outcomes are **advisory decisions** — the framework decided, and
now **your code carries them out.** There is no in-process dispatch; you read `response.outcomes` and act.

Outcome groups and the actions a host typically takes:

| Group        | Example outcome types | Host action |
|--------------|-----------------------|-------------|
| `Validation` | `ComplianceAlert`, `MissingData` | Place a hold; block release; show the error. |
| `Workflow`   | `RouteToQueue`, `RequireReview` | Enqueue, assign, or escalate to a reviewer. |
| `Entity`     | `CreatePlaceholder`, `FlagEntity` | Create a stub record; flag the entity for follow-up. |
| `Derivation` | `SetValue` | None — the value is already in `factsAfter` (see below). |
| `Control`    | `Continue`, `Suppress` | Usually informational. |

Each outcome carries `scope` (the entity it concerns — `order`/`test`/`specimen`/…), `reason` (human-readable
justification), `severity`, and `parameters` (structured, outcome-specific data, e.g. the queue name or the
path/value that was set). Use these to drive the host action precisely.

**Derivation outcomes already wrote back.** Derivation rules can chain: a rule that derives a value stamps it
into the fact document, and later rules see it. That post-run document is returned as `factsAfter`. So you do
**not** apply `SetValue` outcomes yourself — instead read the derived values straight from `factsAfter`:

```ts
const bodySite = response.factsAfter?.specimen?.bodySite; // "Breast"
```

The `SetValue` outcomes in `outcomes` are there for explainability (so you can see *what* was derived and
*why*); `factsAfter` is the authoritative result.

---

## 6. Supporting endpoints

All require `Authorization: Bearer <token>` unless noted. Mutations are role-gated and audited
(actor + target, never PHI).

### Registry (`/api/registry`)

The registry is the **vocabulary** your facts must conform to.

| Method & path | Role | Purpose |
|---|---|---|
| `GET /api/registry/entities` | any authenticated | List all entities (any status) with their fields. |
| `GET /api/registry/vocabulary` | any authenticated | Active entities/fields projection (path, dataType, allowedValues) — use this to build fact documents. |
| `POST /api/registry/validate` | any authenticated | Validate a fact document against the registry; returns `{ valid, errors }`. |
| `POST /api/registry/entities` | Admin | Create an entity. |
| `POST /api/registry/entities/:key/fields` | Admin | Add a field to an entity. |
| `POST /api/registry/entities/:key/deprecate` | Admin | Deprecate an entity (still resolvable). |
| `POST /api/registry/entities/:key/fields/:name/deprecate` | Admin | Deprecate a field. |
| `DELETE /api/registry/entities/:key` | Admin | Retire an entity (must be Deprecated + unreferenced). |
| `DELETE /api/registry/entities/:key/fields/:name` | Admin | Retire a field. |

```bash
# Discover the vocabulary your facts must match
curl -s http://localhost:4000/api/registry/vocabulary -H "Authorization: Bearer $TOKEN"

# Validate a fact document before evaluating
curl -s -X POST http://localhost:4000/api/registry/validate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"facts": {"specimen": {"type": "FFPE", "fixationTime": 24}}}'
```

### Rules governance (`/api/rules`)

Reads are open to any authenticated principal; mutations are role-gated. Authoring mutations **lint against
the live registry first** and reject with `422` (a lint report) on any error.

| Method & path | Role | Purpose |
|---|---|---|
| `GET /api/rules` | any authenticated | List active rules (optional `?asOf=<ISO-8601>&ruleSet=<name>`). |
| `GET /api/rules/:key` | any authenticated | Get a single rule (active version) by key. |
| `POST /api/rules` | Author | Create / save a rule. Lints first; `422` on lint errors. |
| `POST /api/rules/:key/versions` | Author | Add a new effective-dated version. Lints first. |
| `POST /api/rules/:key/approve` | Reviewer | Approve the active version (approver = authenticated principal). |
| `POST /api/rules/:key/promote` | Admin | Promote (enable) a rule. |
| `POST /api/rules/:key/disable` | Admin | Disable a rule (excluded from evaluation). |

```bash
# List active rules as of now
curl -s http://localhost:4000/api/rules -H "Authorization: Bearer $TOKEN"

# Inspect one rule
curl -s http://localhost:4000/api/rules/ny-performing-lab-validation \
  -H "Authorization: Bearer $TOKEN"
```

The lifecycle is **create (Author) → approve (Reviewer) → promote (Admin)**; `disable` (Admin) removes a rule
from evaluation. Every mutation is audited.

### Health (`/health`)

`GET /health` — **anonymous** (no token). Use for liveness / readiness probes.

```bash
curl -s http://localhost:4000/health
```

### API documentation (`/swagger`)

Interactive OpenAPI / Swagger UI is served at `http://localhost:4000/swagger` — the authoritative,
always-current reference for every request and response shape described here.

---

## 7. Error model

All errors are **RFC 7807 problem documents** with `Content-Type: application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "The facts failed registry validation.",
  "traceId": "8f3c…"
}
```

- **`5xx` responses leak no internals** — generic title/detail only; correlate by `traceId` against
  server-side logs.
- **`401`** — missing/invalid token. Re-authenticate.
- **`403`** — authenticated but the role does not permit the operation (e.g. an Author calling `approve`).
- **`404`** — unknown rule/entity key.
- **`422` on `/api/evaluate` (strict mode)** — the facts failed registry validation; the body carries the
  `validation` block.
- **`422` on rule authoring** — a special case. The **lint rejection** body is the linter's
  `{ isValid, findings }` report returned **verbatim**, so authoring tools can render each finding inline.

A host should treat the `validation` block on a non-strict `/api/evaluate` `200` as a soft warning (decide
whether to proceed), and a strict-mode `422` as a hard stop.

---

## Summary

| Step | Endpoint | Host does |
|---|---|---|
| 1. Authenticate | `POST /api/auth/login` | Get a bearer token; send it on every call. |
| 2. Assemble facts | — | Project domain data into an entity-keyed JSON document matching the registry. |
| 3. Decide | `POST /api/evaluate` | POST the facts; receive outcomes + trace + `factsAfter` + validation. |
| 4. Act | — | Read outcomes by group; place holds, route, create placeholders; read derived values from `factsAfter`. |

The framework decides; the host acts. Authoring (and any natural-language drafting) happens at compile time
and is stored in Postgres — the LLM is never on the runtime path, and evaluation is deterministic.
