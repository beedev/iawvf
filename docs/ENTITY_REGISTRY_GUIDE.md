# Entity Registry Guide

> The domain's source of truth for the IAW VDF (Validation & Decision Framework) Node/NestJS backend, modeled **bottom-up**.

This guide explains the entity registry: what it is, how it is shaped, how you grow it, why its vocabulary is a controlled list, and how that vocabulary becomes a runtime contract for the facts a host pushes into the engine.

---

## Table of Contents

1. [The Bottom-Up Model](#1-the-bottom-up-model)
2. [Lifecycle: Active → Deprecated → Retired](#2-lifecycle-active--deprecated--retired)
3. [How add-entity / add-field Works (Endpoints & Role Gates)](#3-how-add-entity--add-field-works-endpoints--role-gates)
4. [Why Objects Are a Controlled List](#4-why-objects-are-a-controlled-list)
5. [Runtime Transaction Validation](#5-runtime-transaction-validation)
6. [How the Host Supplies Facts (the IFactProvider-equivalent)](#6-how-the-host-supplies-facts-the-ifactprovider-equivalent)

---

## 1. The Bottom-Up Model

The registry is the **single source of truth for the domain vocabulary**, and it is modeled from the ground up:

- **ENTITIES** are the classes/nouns of the domain — `specimen`, `order`, `test`, `patient`. Each is a registered "object" in the controlled vocabulary.
- **FIELDS** are the typed properties hanging off an entity — `specimen.fixationTime : Number`, `order.client.nyStatus : String`, `test.capGoverned : Boolean`.

You build *up* from primitive, typed facts (fields) into named domain objects (entities). Rules are then authored against `entity.field` paths — they never invent their own terms.

### Objects are a controlled list, not free text

You **cannot** have `specimen`, `Specimen`, and `spec` all floating around meaning the same thing. The vocabulary is curated:

- Entity keys are **canonical lower-case** and uniqueness is enforced **case-insensitively** — at the DB level the `key` column is uniquely indexed on the lower-cased value.
- An entity key must be a single identifier segment matching `^[a-zA-Z][a-zA-Z0-9]*$` (starts with a letter, then letters/digits; no dots, no dashes, no spaces).
- A field name is one or more dot-separated identifier segments, optionally ending in `[]` to denote a collection: `^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*(\[\])?$`. Examples: `fixationTime`, `client.nyStatus`, `tests[]`.

### Field data types

Field types come from the Prisma `FieldDataType` enum. The actual set is:

| `FieldDataType` | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| `String`        | Text values (and the carrier for `allowedValues` enums) |
| `Number`        | Numeric values                                       |
| `Date`          | Date / date-time values                              |
| `Boolean`       | `true` / `false`                                     |
| `Collection`    | An array-valued field (declared with a trailing `[]`) |

A field may also declare:

- `required: true` — the field must be present within its entity sub-document.
- `allowedValues: [...]` — a **closed set** (enum). When non-empty, only those literal values are accepted; an empty/absent list means "any value of the declared type."

### Canonical seeded entities

The registry ships seeded with these eight canonical entities (projected from the .NET `VocabularyCatalog.Default()` source of truth):

| Entity            | Description                                         | Example fields                                                                 |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `order`           | A test order placed against a patient.              | `type`, `product`, `timepoint`, `client.nyStatus`, `performingLab`, `tests[]`, `specimens[]` |
| `test`            | An individual test within an order.                 | `code`, `specimen.type`, `priority`, `capGoverned : Boolean`                    |
| `specimen`        | A physical specimen submitted for testing.          | `age : Number`, `type` (enum), `bodySite`, `archiveRetrievalDate : Date`, `fixationTime : Number` |
| `patient`         | The patient associated with an order.               | `age : Number`, `gender` (enum: `Male`/`Female`/`Other`)                        |
| `document`        | A document accompanying an order or specimen.       | `circledHE`                                                                     |
| `incident`        | An operational incident raised against an order.    | `ageHours : Number`                                                             |
| `medicalReview`   | A human medical-review decision step.               | `decision`                                                                      |
| `priorTimepoint`  | A prior timepoint in a longitudinal order.          | `status`                                                                         |

Two seeded fields carry `allowedValues` to exercise enum validation end-to-end:

- `specimen.type` ∈ `FFPE`, `FreshTissue`, `BoneMarrow`, `PeripheralBlood`, `ParaffinTissue`, `Blood`, `Unknown`
- `patient.gender` ∈ `Male`, `Female`, `Other`

---

## 2. Lifecycle: Active → Deprecated → Retired

Both entities and fields carry a `RegistryStatus` that moves in one direction:

```
Active  ──deprecate──▶  Deprecated  ──retire──▶  Retired (hard removal)
```

| Status       | Meaning                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `Active`     | In use. Appears in the `vocabulary` projection; available to authoring, grounding, and runtime validation. |
| `Deprecated` | **Still resolvable** — existing rules that reference it keep working — but signals *do not use for new rules*. Dropped from the `vocabulary` projection so authors stop reaching for it. |
| `Retired`    | Hard removal. Only permitted when the item is already `Deprecated` **and** unreferenced by any rule.       |

**Why two steps?** Deprecation is the soft, reversible signal that keeps the system running while you migrate rules off a term. Retirement is the irreversible cleanup, gated so you can never break a rule that still references the item.

**Governance:** every mutation (create, add field, deprecate, retire) requires the **Admin** role and is **audited** — the audit records the *actor* and the *target* (entity key / field name), and **never PHI**.

---

## 3. How add-entity / add-field Works (Endpoints & Role Gates)

All endpoints live under `/api/registry` and require a Bearer token (any authenticated principal for reads; **Admin** for mutations).

| Method & Path                                              | Role           | Behavior                                                                 |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| `GET    /api/registry/entities`                            | any authenticated | List **all** entities (any status) with their fields.                  |
| `POST   /api/registry/entities`                            | **Admin**      | Create an entity. `201` on success; **`409`** on a case-insensitive duplicate key; key must match the identifier pattern. |
| `POST   /api/registry/entities/:key/fields`                | **Admin**      | Add a field to an existing entity. `201` on success.                     |
| `POST   /api/registry/entities/:key/deprecate`             | **Admin**      | Deprecate an entity (kept resolvable). `200`.                            |
| `POST   /api/registry/entities/:key/fields/:name/deprecate`| **Admin**      | Deprecate a field (kept resolvable). `200`.                             |
| `DELETE /api/registry/entities/:key`                       | **Admin**      | Retire an entity — must be `Deprecated` **and** unreferenced. `204`.    |
| `DELETE /api/registry/entities/:key/fields/:name`          | **Admin**      | Retire a field — must be `Deprecated` **and** unreferenced. `204`.      |
| `GET    /api/registry/vocabulary`                          | any authenticated | **Active** entities/fields projection — the authoring scope-picker / LLM grounding source. |
| `POST   /api/registry/validate`                            | any authenticated | Validate a fact document against the registry.                         |

### Step 0 — Get a token

Mutations require an Admin token. Log in first:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin-pw"}' \
  | jq -r '.accessToken')
```

(Use the field your `/api/auth/login` returns; commonly `accessToken`.)

### Step 1 — Create an entity

Body shape: `{ key, label?, description? }`. `label` is derived from `key` when omitted.

```bash
curl -s -X POST http://localhost:3000/api/registry/entities \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "kit",
    "label": "Kit",
    "description": "A collection kit shipped to the client."
  }'
```

- `201 Created` returns the new entity (with an empty `fields` array).
- `409 Conflict` if `kit`, `Kit`, or `KIT` already exists (case-insensitive).
- `400 Bad Request` if `key` violates `^[a-zA-Z][a-zA-Z0-9]*$`.

### Step 2 — Add a field

Body shape: `{ name, dataType, required?, allowedValues?, description? }`.

```bash
curl -s -X POST http://localhost:3000/api/registry/entities/kit/fields \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "shipMode",
    "dataType": "String",
    "required": true,
    "allowedValues": ["Ground", "Air", "Courier"],
    "description": "How the kit is shipped."
  }'
```

- `name` may be dot-separated (`client.nyStatus`) and may end in `[]` for a collection (`tests[]`).
- `dataType` must be one of `String | Number | Date | Boolean | Collection`.
- `allowedValues` is an optional closed enum (max 256 entries); empty/omitted means "any."

### Step 3 — Deprecate (when migrating away)

```bash
curl -s -X POST http://localhost:3000/api/registry/entities/kit/deprecate \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3000/api/registry/entities/kit/fields/shipMode/deprecate \
  -H "Authorization: Bearer $TOKEN"
```

### Step 4 — Retire (hard removal; Deprecated + unreferenced only)

```bash
curl -s -X DELETE http://localhost:3000/api/registry/entities/kit/fields/shipMode \
  -H "Authorization: Bearer $TOKEN"   # 204 No Content

curl -s -X DELETE http://localhost:3000/api/registry/entities/kit \
  -H "Authorization: Bearer $TOKEN"   # 204 No Content
```

If the item is still `Active`, or is referenced by any rule, retirement is rejected.

### The vocabulary projection

`GET /api/registry/vocabulary` returns **only Active** entities and their **Active** fields, each property carrying its fully-qualified `path`:

```bash
curl -s http://localhost:3000/api/registry/vocabulary \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "objects": [
    {
      "key": "specimen",
      "label": "Specimen",
      "status": "Active",
      "properties": [
        {
          "path": "specimen.type",
          "name": "type",
          "dataType": "String",
          "status": "Active",
          "allowedValues": ["FFPE", "FreshTissue", "BoneMarrow", "PeripheralBlood", "ParaffinTissue", "Blood", "Unknown"]
        },
        {
          "path": "specimen.fixationTime",
          "name": "fixationTime",
          "dataType": "Number",
          "status": "Active",
          "allowedValues": []
        }
      ]
    }
  ]
}
```

This projection is what the **authoring scope-picker** and **LLM grounding** read — it is the menu authors and models pick from.

---

## 4. Why Objects Are a Controlled List

Rules are authored **against the projected vocabulary**. Every rule subject and value must resolve to a registered `entity.field`. That single constraint is what makes three otherwise-independent capabilities coherent:

1. **Lint** — A rule can be statically checked because every referenced path either resolves to a known `entity.field` or it doesn't. If terms were free text, "resolves to a known path" would be undefinable.
2. **Grounding** — When the LLM proposes a rule, it is grounded in the `vocabulary` projection: it can only reference real, Active paths. There is exactly one name per concept to ground against.
3. **Runtime validation** — Incoming facts are checked against the same registry the rules were authored against, so author intent and runtime data share one definition.

If authoring allowed free text, two authors could invent `specimen.fixation`, `specimen.fixTime`, and `specimen.fixationTime` for the same concept. The vocabulary fragments, lint can no longer tell a typo from a new field, grounding has nothing stable to point at, and runtime validation has no canonical schema to enforce. **The controlled list is the contract** that keeps lint, grounding, and runtime validation talking about the same thing.

---

## 5. Runtime Transaction Validation

At runtime, a **fact document** (a JSON object keyed by entity) is validated against the registry using **Ajv-compiled, per-entity JSON Schemas** — one compiled validator per Active entity.

### The lenient model

The validator is intentionally **lenient at the boundary** but strict **within** a known entity:

- **Unknown top-level keys are skipped.** If a fact document has a key the registry doesn't model, it is ignored — the registry does not claim ownership of it.
- **Within a known entity:** type mismatches, bad enum values, and missing `required` fields **are reported**.
- **Extra, unmodelled fields within a known entity are tolerated** — they do not produce errors.

### Caching

Compiled Ajv validators are **cached** and **rebuilt lazily** on the first validation *after* any registry mutation. The registry fires a change hook that marks the cache stale; the next validation recompiles. (Only `Active` entities get validators; `Deprecated`/`Retired` entities are excluded from the compiled set.)

### Errors are entity/path-scoped and message-only (no PHI)

Each error is `{ entity, path, message }`. The `path` is rooted at the entity key and dot-joined (e.g. `specimen.type`); for missing-required errors the missing property name is appended. **No fact values appear in the error** — only the path and a generic message — so the validation output is PHI-safe.

### Request / response shape

`POST /api/registry/validate` — body is `{ "facts": { ...entity-keyed... } }`:

```bash
curl -s -X POST http://localhost:3000/api/registry/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "facts": {
      "specimen": { "type": "Plasma", "fixationTime": 12 },
      "patient":  { "gender": "Male", "age": 40 },
      "weather":  { "temp": 72 }
    }
  }'
```

Response (`200 OK`):

```json
{
  "valid": false,
  "errors": [
    {
      "entity": "specimen",
      "path": "specimen.type",
      "message": "must be equal to one of the allowed values"
    }
  ]
}
```

Note what happened:

- `specimen.type: "Plasma"` is **not** in the `allowedValues` enum → reported.
- `specimen.fixationTime: 12` is a valid `Number` → fine.
- `patient` is fully valid → no errors.
- `weather` is **unknown** at the top level → silently skipped (not an error).

Result shape: `{ valid: boolean, errors: FactValidationError[] }` where `valid` is `true` only when `errors` is empty.

---

## 6. How the Host Supplies Facts (the IFactProvider-equivalent)

In the original .NET stack, a host implemented an in-process `IFactProvider` interface and the engine pulled facts from it. **The Node stack has no in-process fact-provider interface.** Instead, **facts come in over the wire** as the request body to the evaluation endpoint.

### The boundary

```
┌─────────────────┐   entity-keyed facts JSON    ┌──────────────────────────┐
│   Host system   │  ─────────────────────────▶  │  POST /api/evaluate      │
│ (fact assembler)│                              │  (NestJS VDF backend)    │
│                 │  ◀─────────────────────────  │                          │
└─────────────────┘   outcomes + trace +         └──────────────────────────┘
        │             factsAfter + validation
        ▼
   ACTS on outcomes
```

1. The **host gathers domain data** — the order, its specimens, the patient, tests, documents, etc. — typically from its own databases or services. A host-side **"fact assembler"** is the moral equivalent of the old `IFactProvider`: its job is to *shape* that data into the entity-keyed fact document.
2. The host shapes it into a JSON object **keyed by entity** (`factsJson`) and POSTs it to `/api/evaluate`.
3. The framework **validates** the facts against the registry, **evaluates** the active rules, and returns the outcomes (plus trace, post-run facts, and a validation block).
4. The **host acts** on the returned outcomes (route the order, hold a test, raise an incident, etc.).

This is precisely the seam where the **registry contract (vocabulary)** meets the **actual transaction data**: the fact document must speak the vocabulary the rules were authored against.

### Request

`POST /api/evaluate` (any authenticated principal). Body fields:

| Field         | Type    | Notes                                                                                  |
| ------------- | ------- | -------------------------------------------------------------------------------------- |
| `factsJson`   | object  | **Required.** The facts to evaluate, keyed by entity.                                  |
| `ruleSet`     | string  | Optional rule-set filter; when omitted, **all active rules** apply.                    |
| `triggerType` | enum    | Optional; one of `OrderEvent` \| `TimeSchedule` \| `DecisionReturned`. Defaults to `OrderEvent`. |
| `strict`      | boolean | Optional. When `true`, a registry-validation failure **blocks** evaluation with a **`422`**. Default `false`: outcomes are returned alongside the validation block so the UI can surface mismatches without losing the decision. |

```bash
curl -s -X POST http://localhost:3000/api/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "factsJson": {
      "order":    { "client": { "nyStatus": "Standard" } },
      "test":     { "code": "FISH-T-001", "specimen": { "type": "FFPE" } },
      "specimen": { "type": "FFPE", "fixationTime": 24 }
    },
    "strict": false
  }'
```

### Response (`200 OK`)

```json
{
  "outcomes": [
    {
      "type": "...",
      "group": "...",
      "scope": null,
      "reason": null,
      "severity": null,
      "parameters": {}
    }
  ],
  "trace": [
    {
      "ruleKey": "...",
      "version": 1,
      "phase": "...",
      "applied": true,
      "assertResult": null,
      "conditions": [
        {
          "subject": "specimen.type",
          "operator": "Equals",
          "resolvedLeft": "FFPE",
          "resolvedRight": "FFPE",
          "result": true
        }
      ],
      "produced": { "type": "...", "group": "...", "scope": null, "reason": null, "severity": null, "parameters": {} }
    }
  ],
  "factsAfter": { "order": { "...": "..." } },
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

The response carries four things:

- **`outcomes`** — what the rules decided; the host acts on these.
- **`trace`** — the full per-rule decision trace (each rule's conditions, results, and produced outcome) for explainability/audit.
- **`factsAfter`** — the post-run facts (facts may be mutated/derived during evaluation).
- **`validation`** — the same `{ valid, errors }` registry-validation block as `/api/registry/validate`, so the UI/host can surface fact ↔ registry mismatches even when evaluation succeeded.

### Strict mode

With `strict: true`, if the facts fail registry validation the endpoint returns **`422 Unprocessable Entity`** and does **not** evaluate:

```json
{
  "message": "The facts failed registry validation.",
  "validation": {
    "valid": false,
    "errors": [
      { "entity": "specimen", "path": "specimen.type", "message": "must be equal to one of the allowed values" }
    ]
  }
}
```

Use `strict: true` when bad facts must hard-stop the transaction; use the default (`false`) when you want the decision plus a non-blocking heads-up about mismatches.

> **Audit note:** evaluation is logged with the actor, the rule set, and *counts only* (outcomes, rules traced, validation errors) under a correlation id — **never the facts themselves**, keeping the audit trail PHI-free. The decision trace is persisted to the audit store under that same correlation id.
