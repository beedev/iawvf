# IAW Validation & Decision Framework — API Reference

The entire Validation & Decision Framework (VDF) is available over a REST API. This document is a
**curated** companion to the machine-readable contract. The source of truth is always the live
OpenAPI specification served by the running API:

- **Interactive explorer (Swagger UI):** <http://localhost:4000/swagger>
- **Raw OpenAPI 3 document (JSON):** <http://localhost:4000/swagger-json>
- **In-app reference (live, never drifts):** the **API Reference** item in the app's Workspace nav
  (`/api-docs`) renders this same spec directly from the server.

> The in-app reference and Swagger UI are generated from the spec, so they cannot drift from the
> running service. Use this Markdown for the narrative, examples, and role guidance.

---

## Overview

| | |
| --- | --- |
| **Title** | IAW Validation & Decision Framework — API |
| **Base URL** | `http://localhost:4000` (configurable via `VITE_API_BASE_URL` in the UI) |
| **Content type** | `application/json` for all request and response bodies |
| **Auth** | Bearer JWT (`Authorization: Bearer <token>`) on every endpoint except `POST /api/auth/login` and `GET /health` |
| **Error shape** | RFC-7807 `application/problem+json` for most errors; lint rejections (422) return a `LintReport` verbatim |

### Authentication

All functional endpoints require a signed JWT. Obtain one from the login endpoint, then send it on
the `Authorization` header of subsequent requests.

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "lead", "password": "lead-pw" }
```

```jsonc
// 200 OK
{
  "accessToken": "eyJhbGciOi…",   // signed JWT — send as: Authorization: Bearer <accessToken>
  "tokenType": "Bearer",
  "expiresIn": 3600,               // seconds
  "username": "lead",
  "roles": ["Author", "Reviewer", "Admin"]
}
```

`401 Unauthorized` is returned for invalid credentials.

#### Dev users & roles

These are non-secret, local-only credentials that exercise the JWT + role pipeline. Roles gate
write operations; **all roles can read**.

| Username   | Password      | Roles                       | Can do                                                          |
| ---------- | ------------- | --------------------------- | --------------------------------------------------------------- |
| `author`   | `author-pw`   | Author                      | Interpret, lint, paraphrase, dry-run, and save **draft** rules. |
| `reviewer` | `reviewer-pw` | Reviewer                    | **Approve** the active version of a rule.                       |
| `admin`    | `admin-pw`    | Admin                       | **Promote** (enable) and **disable** rules; manage the registry.|
| `lead`     | `lead-pw`     | Author · Reviewer · Admin   | Combined account for end-to-end authoring and governance.       |

Role enforcement is **defense in depth**: the API returns `403 Forbidden` when a principal lacks the
required role, independent of any UI gating.

---

## Endpoint groups

Endpoints are grouped by their OpenAPI tag. Method + path + role + purpose are listed for each, with
a representative request/response.

### Auth

| Method | Path              | Role   | Purpose                              |
| ------ | ----------------- | ------ | ------------------------------------ |
| POST   | `/api/auth/login` | Public | Authenticate and obtain a JWT token. |

See [Authentication](#authentication) above for the request/response shape.

---

### Evaluate

| Method | Path            | Role          | Purpose                                                              |
| ------ | --------------- | ------------- | -------------------------------------------------------------------- |
| POST   | `/api/evaluate` | Any (Bearer)  | Validate facts, evaluate the active rule set, return outcomes + trace.|

Validates the supplied facts against the registry, runs the active rule set, and returns the
outcomes, a decision trace, the post-run facts, and a validation block. In non-strict mode (default)
outcomes are returned **alongside** any validation mismatches so the UI never loses the decision; set
`strict: true` to fail with `422` on a registry validation error.

```http
POST /api/evaluate
Authorization: Bearer <token>
Content-Type: application/json

{
  "factsJson": {
    "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" } },
    "specimen": { "type": "FFPE", "fixationTime": 24 },
    "order": { "client": { "nyStatus": "Standard" } }
  },
  "triggerType": "OrderEvent",
  "strict": false
}
```

```jsonc
// 200 OK
{
  "outcomes": [
    {
      "type": "Hold",
      "group": "Validation",
      "reason": "Circled H&E required for Technical FISH on FFPE",
      "parameters": {},
      "ruleKey": "PM17",
      "ruleName": "Circled H&E required for Technical FISH on FFPE"
    }
  ],
  "trace": [ /* DecisionTrace per rule: conditions evaluated + match result */ ],
  "factsAfter": { /* facts after derivations, or null */ },
  "validation": { "valid": true, "errors": [] }
}
```

---

### Authoring

The authoring endpoints turn plain English into grounded rule JSON and check it against the live
vocabulary — without persisting anything.

| Method | Path                        | Role          | Purpose                                                                 |
| ------ | --------------------------- | ------------- | ----------------------------------------------------------------------- |
| GET    | `/api/authoring/vocabulary` | Any (Bearer)  | Controlled vocabulary as an object → property tree (Active only).       |
| POST   | `/api/authoring/interpret`  | Any (Bearer)  | Interpret natural language into a candidate rule, grounded on the registry. |
| POST   | `/api/authoring/lint`       | Any (Bearer)  | Lint a rule JSON object against the live vocabulary.                    |
| POST   | `/api/authoring/paraphrase` | Any (Bearer)  | Deterministic English paraphrase of a rule.                             |
| POST   | `/api/authoring/dry-run`    | Any (Bearer)  | Dry-run a candidate rule against the fixtures corpus (no side effects). |

**Interpret**

```http
POST /api/authoring/interpret
Authorization: Bearer <token>

{
  "naturalLanguage": "Hold technical FISH orders on FFPE specimens fixed under 6 hours.",
  "properties": ["specimen.fixationTime", "test.code"]
}
```

The response carries the candidate `ruleJson`, the grounding it used, and a confidence signal.

**Lint / Paraphrase / Dry-run** all take the same body — a rule JSON object:

```http
POST /api/authoring/lint
Authorization: Bearer <token>

{ "ruleJson": { "key": "PM17", "when": { /* … */ }, "then": [ /* … */ ] } }
```

```jsonc
// 200 OK — a LintReport (returned verbatim, even on failure)
{
  "isValid": false,
  "findings": [
    { "severity": "Error", "code": "UNKNOWN_PATH", "message": "specimen.fixationTimee is not in the vocabulary.", "path": "when.all[0].subject" }
  ]
}
```

---

### Rules & governance

The rule repository and its governance lifecycle: create (Author) → approve (Reviewer) → promote
(Admin) → disable (Admin). Saves are **linted first** and rejected with `422` (carrying a
`LintReport`) when lint errors exist.

| Method | Path                          | Role     | Purpose                                                         |
| ------ | ----------------------------- | -------- | --------------------------------------------------------------- |
| GET    | `/api/rules`                  | Any      | List active rules (optionally at a point in time / by rule set).|
| GET    | `/api/rules/{key}`            | Any      | Return a single rule (active version) by key.                   |
| POST   | `/api/rules`                  | Author   | Create / save a rule. Lints first; `422` on lint errors.        |
| POST   | `/api/rules/{key}/versions`   | Author   | Add a new effective-dated version. Lints first.                 |
| POST   | `/api/rules/{key}/approve`    | Reviewer | Approve the active version. Approver = the authenticated principal. |
| POST   | `/api/rules/{key}/promote`    | Admin    | Promote (enable) a rule.                                        |
| POST   | `/api/rules/{key}/disable`    | Admin    | Disable a rule (excluded from evaluation).                      |

**List**

```http
GET /api/rules?ruleSet=PreMolecular
Authorization: Bearer <token>
```

```jsonc
// 200 OK — RuleSummary[]
[
  {
    "key": "PM17",
    "name": "Circled H&E required for Technical FISH on FFPE",
    "ruleSet": "PreMolecular",
    "phase": "Validation",
    "priority": 100,
    "enabled": true,
    "version": 3,
    "effectiveDate": "2026-01-01",
    "expiryDate": null
  }
]
```

**Create (Author)**

```http
POST /api/rules
Authorization: Bearer <token>

{ "ruleJson": { "key": "PM17", "name": "…", "when": { /* … */ }, "then": [ /* … */ ] } }
```

```jsonc
// 422 Unprocessable Entity — lint rejection (LintReport, not problem+json)
{ "isValid": false, "findings": [ { "severity": "Error", "message": "…" } ] }
```

**Approve (Reviewer)** — the persisted approver is **always** the authenticated principal; the
optional `approver` body field is a display-only hint and is never trusted for audit.

```http
POST /api/rules/PM17/approve
Authorization: Bearer <token>

{ "approver": "Dr. Reviewer" }
```

---

### Registry

The controlled vocabulary modelled as **entities** (top-level fact objects) that own **fields**
(their addressable properties). Reads are open to any authenticated principal; **mutations require
the Admin role**.

| Method | Path                                                     | Role  | Purpose                                              |
| ------ | -------------------------------------------------------- | ----- | ---------------------------------------------------- |
| GET    | `/api/registry/entities`                                | Any   | List all entities (any status) with their fields.    |
| POST   | `/api/registry/entities`                                | Admin | Create an entity (`409` on case-insensitive dup key).|
| POST   | `/api/registry/entities/{key}/fields`                   | Admin | Add a field to an existing entity.                   |
| POST   | `/api/registry/entities/{key}/deprecate`                | Admin | Deprecate an entity (kept resolvable).               |
| POST   | `/api/registry/entities/{key}/fields/{name}/deprecate`  | Admin | Deprecate a field (kept resolvable).                 |
| DELETE | `/api/registry/entities/{key}`                          | Admin | Retire an entity (must be Deprecated & unreferenced).|
| DELETE | `/api/registry/entities/{key}/fields/{name}`            | Admin | Retire a field (same gates as entity retirement).    |
| POST   | `/api/registry/validate`                                | Any   | Validate a fact document against the registry schema.|
| GET    | `/api/registry/vocabulary`                              | Any   | Active entities/fields projection for authoring.     |

**Create entity (Admin)**

```http
POST /api/registry/entities
Authorization: Bearer <token>

{ "key": "kit", "label": "Kit", "description": "Collection kit metadata." }
```

`409 Conflict` on a case-insensitive duplicate key; `400` on an invalid key.

**Add field (Admin)** — the entity must already exist (selected, not free-typed); `404` if it is
gone, `409` on a duplicate field.

```http
POST /api/registry/entities/order/fields
Authorization: Bearer <token>

{
  "name": "client.nyStatus",
  "dataType": "String",
  "required": false,
  "allowedValues": ["Standard", "Priority"]
}
```

**Validate facts**

```http
POST /api/registry/validate
Authorization: Bearer <token>

{
  "facts": {
    "specimen": { "type": "FFPE", "fixationTime": 12 },
    "patient":  { "gender": "Male", "age": 40 }
  }
}
```

```jsonc
// 200 OK — FactValidationResult
{ "valid": true, "errors": [] }
```

**Retire** (`DELETE`) returns `204 No Content` on success, `422` when the target is not yet
deprecated, and `409` when it is still referenced (the conflict detail explains the block).

---

### Health

| Method | Path      | Role   | Purpose                          |
| ------ | --------- | ------ | -------------------------------- |
| GET    | `/health` | Public | Service and dependency health.   |

```jsonc
// 200 OK
{ "status": "ok" }
```

---

## Errors at a glance

| Status | Meaning                                                                                 |
| ------ | --------------------------------------------------------------------------------------- |
| `400`  | Malformed request (e.g. invalid entity key).                                            |
| `401`  | Missing/expired/invalid token — re-authenticate via `POST /api/auth/login`.             |
| `403`  | Authenticated but lacks the required role (Author/Reviewer/Admin).                      |
| `404`  | Target not found (e.g. adding a field to a missing entity).                             |
| `409`  | Conflict (duplicate key, or a retire blocked by references).                            |
| `422`  | Validation failure — **lint rejection** (`LintReport`) for rule saves, or strict-mode evaluate. |

---

## Using the interactive explorer

For live calls with a real bearer token, open the **Swagger UI** at
<http://localhost:4000/swagger>: authenticate via `POST /api/auth/login`, click **Authorize**, paste
`Bearer <accessToken>`, and exercise any endpoint against the running service.
