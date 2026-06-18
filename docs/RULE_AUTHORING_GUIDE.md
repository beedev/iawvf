# VDF Rule Authoring Guide

How to author a rule from plain English, read the interpretation and its gaps, validate it with
lint / paraphrase / dry-run, and govern it through versioning, approval, and effective-dating. The flow is
the same whether you use the React UI or call the API directly; the UI is a thin client over these
endpoints (served by the Node/NestJS backend).

> Authoring is **compile-time**. The LLM interpreter translates English into a *candidate* rule expressed
> in the controlled vocabulary. That candidate is only a **proposal**: it is always validated by a
> deterministic gate (schema + registry-grounded lint) before it can be governed. Once stored, the rule is
> evaluated by the deterministic engine — **the LLM is never in the runtime decision path.**

## Base URL & authentication

- **Base URL:** `http://localhost:4000`
- Obtain a token from `POST /api/auth/login`, then send it on every request as
  `Authorization: Bearer <token>`.
- Roles are plain role names enforced by the `@Roles(...)` decorator and a global `RolesGuard`. There are
  no .NET policy names.

```bash
# Get a token (the response carries an access token).
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"author","password":"author-pw"}'
# → { "accessToken": "<jwt>", ... }

# Capture it for the examples that follow.
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"author","password":"author-pw"}' | jq -r .accessToken)
```

## Roles

| Role | Decorator | Can do |
|---|---|---|
| **Author** | `@Roles(Role.Author)` | interpret, lint, paraphrase, dry-run, create rules, add versions |
| **Reviewer** | `@Roles(Role.Reviewer)` | approve the active version of a rule |
| **Admin** | `@Roles(Role.Admin)` | promote (enable) / disable a rule |

Reads (`GET /api/rules`, `GET /api/rules/:key`) and the vocabulary tree
(`GET /api/authoring/vocabulary`) are open to **any authenticated principal**.

### Dev credentials

In-memory dev users for obtaining a token (replaced by a real identity provider later):

| Username | Password | Roles |
|---|---|---|
| `author` | `author-pw` | Author |
| `reviewer` | `reviewer-pw` | Reviewer |
| `admin` | `admin-pw` | Admin |
| `lead` | `lead-pw` | Author + Reviewer + Admin (handy for end-to-end demos) |

## Error model

All errors follow **RFC 7807 `application/problem+json`** — `{ type, title, status, detail, ... }` — except
one deliberate case: a governance **lint rejection** returns the lint report **verbatim** as a `422`,
`{ "isValid": false, "findings": [ ... ] }`, so the UI can render the findings directly. The interpreter
never returns a `500` that could leak provider/config detail: an unavailable interpreter degrades to `503`,
and an unknown vocabulary scope is a `400`.

## Rule anatomy

Before authoring, understand what you are producing. A rule has **four parts** (plus an optional recover):

1. **WHEN** — `appliesWhen`: the gate that decides whether the rule applies at all.
2. **DECISION** — `assert`: the condition that must hold (omitted for degenerate derivation rules).
3. **ON SUCCESS** — `onSuccess`: the outcome when the assertion holds.
4. **recover** *(optional)* — a fix to attempt *before* failing.
5. **ON FAILURE** — `onFailure`: the outcome when the assertion does not hold (and recovery did not resolve it).

**Operator families (6):**

| Family | Operators |
|---|---|
| Presence | `IsPresent`, `IsAbsent` |
| Equality | `Equals`, `NotEquals` |
| Membership | `InSet`, `NotInSet` |
| Comparison | `GreaterThan`, `LessThan`, `GreaterOrEqual`, `LessOrEqual`, `WithinRange` |
| Matching | `Matches`, `IsCompatibleWith` |
| Reference-eligibility | `IsEligibleFor`, `Exists` |

**Quantifiers** (for collection subjects): `This`, `Any`, `Every`.

**Outcome groups (5):** Validation, Workflow, Derivation, Entity, Control.

**Phases** run in a fixed order: **Derive → Validate → Route**. A derivation in `Derive` is visible to the
`Validate`/`Route` rules that read it — this is how rules chain.

## The authoring loop

```
   interpret ─► lint ─► paraphrase ─► dry-run ─► govern (create → approve → promote)
```

All authoring endpoints live under `/api/authoring`. The vocabulary read is open to any authenticated
principal; the rest require **Author**.

### 1. Vocabulary — the controlled vocabulary tree

`GET /api/authoring/vocabulary` *(any authenticated principal)* returns the Active objects → properties
tree plus the operator and outcome names. This is the scope-picker source.

```bash
curl -s http://localhost:4000/api/authoring/vocabulary \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "objects": [
    { "name": "order", "label": "Order", "properties": [
      { "path": "order.client.nyStatus", "name": "nyStatus", "dataType": "string" },
      { "path": "order.performingLab",    "name": "performingLab", "dataType": "string" }
    ] }
  ],
  "operators": ["IsPresent", "Equals", "IsEligibleFor", "IsCompatibleWith", "..."],
  "outcomes":  ["Continue", "ComplianceAlert", "CompleteHold", "SetValue", "..."]
}
```

### 2. Interpret — English → candidate rule

`POST /api/authoring/interpret` *(Author)* with the natural-language rule. Body is `InterpretRequestDto`:

| Field | Type | Notes |
|---|---|---|
| `naturalLanguage` | string (≤ 4000 chars) | The author's plain-English rule. |
| `objects` | string[]? | Optional **object-level** scope (e.g. `["order"]`). Ignored when `properties` is non-empty. |
| `properties` | string[]? | Optional **property-level** scope (full subject paths, e.g. `["order.performingLab"]`). **Takes precedence** over `objects`. |

The interpreter grounds the model on the (optionally scoped) registry vocabulary and returns
`InterpretResponseDto`:

| Field | Meaning |
|---|---|
| `candidate` | the candidate rule JSON, or `null` if it could not produce one |
| `confidence` | how sure the interpreter is it captured your intent |
| `unmappedPhrases` | words it could **not** express in the controlled vocabulary — the highest-signal warnings |
| `gaps` | concerns the rule may be missing (an outcome scope, a recovery path, an effective date) |

Behaviour:

- An **unknown scope** (object/property not in the registry) is a **`400`** — the UI can never silently
  scope to nothing.
- An **unavailable interpreter** degrades to a **`503`** — never a `500` leaking provider detail.
- With `OPENAI_ENABLED=false` the interpreter falls back to an **offline stub** (deterministic, useful for
  local dev and tests).

```bash
curl -s -X POST http://localhost:4000/api/authoring/interpret \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "naturalLanguage": "When the ordering client is NY-regulated, the performing lab must be on the NY-validated lab list.",
    "objects": ["order"]
  }'
```

```json
{
  "candidate": { "key": "BL8", "phase": "Validate", "appliesWhen": { "..." }, "...": "..." },
  "confidence": 0.91,
  "unmappedPhrases": [],
  "gaps": []
}
```

Treat low confidence, **any** unmapped phrase, or an unresolved gap as "not done." Edit the English (or the
candidate JSON) and re-interpret until the candidate is clean. If the interpreter is unavailable (`503`),
author the rule JSON directly and skip to lint.

### 3. Lint — validate against the vocabulary (the deterministic gate)

`POST /api/authoring/lint` *(Author)* with `{ "ruleJson": { ... } }`. The linter is **registry-grounded**:
every subject path and every reference/value must resolve to the controlled vocabulary, and each outcome
must carry its required parameters. It returns `LintReportDto`:

```json
{ "isValid": false, "findings": [
  { "severity": "Error", "code": "LINT001", "message": "Unknown subject path", "path": "order.bogus" }
] }
```

| Code | Meaning |
|---|---|
| `LINT001` | Unknown subject path (not in the vocabulary) |
| `LINT003` | Unknown reference key |
| `LINT005`–`LINT008` | Missing required outcome parameter (e.g. `SetValue` without `Target`/`Value`) |
| `LINT101`/`LINT102` | Warnings (advisory) |

Any **error**-severity finding makes the report invalid — and governance (`POST /api/rules`) will reject the
rule with `422` until it lints clean.

```bash
curl -s -X POST http://localhost:4000/api/authoring/lint \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "ruleJson": '"$(cat candidate.json)"' }'
```

### 4. Paraphrase — confirm intent

`POST /api/authoring/paraphrase` *(Author)* with `{ "ruleJson": { ... } }` renders the rule back to
deterministic English for round-trip confirmation. Returns `{ "paraphrase": "..." }`.

```bash
curl -s -X POST http://localhost:4000/api/authoring/paraphrase \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "ruleJson": '"$(cat candidate.json)"' }'
```

```json
{ "paraphrase": "When the ordering client is NY-regulated, the performing lab must be eligible for TestCompendium.nyValidation; otherwise raise a compliance alert on the order." }
```

Read it as a human: does it say what you meant? The paraphrase is the round-trip check that catches subtle
operator/scope mistakes that lint cannot.

### 5. Dry-run — see what it does

`POST /api/authoring/dry-run` *(Author)* with `{ "ruleJson": { ... } }` evaluates the candidate against the
repo fixtures corpus in a **no-side-effects** sandbox. Returns `DryRunResponseDto`:

```json
{ "evaluated": 12, "hits": [
  { "fixtureName": "ny-order-unvalidated-lab", "applied": true,  "produced": "ComplianceAlert", "reason": "Performing lab not on NY-validated list" },
  { "fixtureName": "ca-order",                 "applied": false, "produced": null,             "reason": "appliesWhen not satisfied" }
] }
```

```bash
curl -s -X POST http://localhost:4000/api/authoring/dry-run \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "ruleJson": '"$(cat candidate.json)"' }'
```

Confirm it fires on the cases it should and stays silent on the cases it should not — *before* it touches
production rules.

## Governance

All governance endpoints live under `/api/rules`.

| Step | Endpoint | Role |
|---|---|---|
| Create / save (lints first; `422` on lint errors, `201` on success) | `POST /api/rules` | Author |
| Add an effective-dated version | `POST /api/rules/:key/versions` | Author |
| Approve the active version | `POST /api/rules/:key/approve` | Reviewer |
| Promote (enable) | `POST /api/rules/:key/promote` | Admin |
| Disable (excluded from evaluation) | `POST /api/rules/:key/disable` | Admin |
| List active rules (optional `asOf` / `ruleSet`) | `GET /api/rules` | any auth |
| Full rule + provenance | `GET /api/rules/:key` | any auth |

### Create / save — `POST /api/rules` (Author)

Body is `CreateRuleRequestDto`:

| Field | Type | Notes |
|---|---|---|
| `ruleJson` | object | The rule definition. |
| `authorNl` | string? (≤ 4000) | Optional natural-language provenance. |
| `interpreterVersion` | string? (≤ 128) | Optional interpreter version stamp. |

The server **lints first**. On any lint error it returns **`422`** with the verbatim lint report
`{ isValid, findings }`. On success it returns `201` with `{ key, version, message }`.

```bash
curl -s -X POST http://localhost:4000/api/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "ruleJson": '"$(cat candidate.json)"',
    "authorNl": "When the ordering client is NY-regulated, the performing lab must be on the NY-validated lab list.",
    "interpreterVersion": "stub-1"
  }'
# → 201 { "key": "BL8", "version": 1, "message": "Rule 'BL8' saved as version 1." }
# (on lint error → 422 { "isValid": false, "findings": [ ... ] })
```

### Add a version — `POST /api/rules/:key/versions` (Author)

Body `{ "ruleJson": { ... }, "effectiveDate": "<ISO-8601>" }`. The `ruleJson.key` must match the route key.
Lints first. A version with `effectiveDate <= now` becomes the single active version and deactivates its
predecessors. To replay a past decision, evaluate with the historical `asOf` — the engine selects the
version that was active then.

```bash
curl -s -X POST http://localhost:4000/api/rules/BL8/versions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "ruleJson": '"$(cat candidate.json)"', "effectiveDate": "2026-07-01T00:00:00Z" }'
```

### Approve — `POST /api/rules/:key/approve` (Reviewer)

Approves the active version. **The approver recorded is the authenticated principal, never the request
body** — the optional `approver` field in the body is a display hint only and is never persisted as the
audit identity.

```bash
RTOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"reviewer","password":"reviewer-pw"}' | jq -r .accessToken)

curl -s -X POST http://localhost:4000/api/rules/BL8/approve \
  -H "Authorization: Bearer $RTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
# → 200 { "key": "BL8", "version": 1, "message": "Rule 'BL8' version 1 approved." }
```

### Promote / disable — `POST /api/rules/:key/{promote,disable}` (Admin)

`promote` enables the rule; `disable` excludes it from evaluation.

```bash
ATOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin-pw"}' | jq -r .accessToken)

curl -s -X POST http://localhost:4000/api/rules/BL8/promote \
  -H "Authorization: Bearer $ATOKEN"
# → 200 { "key": "BL8", "version": null, "message": "Rule 'BL8' promoted." }
```

### Inspect

```bash
# List active rules (optionally at a point in time / by rule set).
curl -s "http://localhost:4000/api/rules?asOf=2026-07-01T00:00:00Z&ruleSet=ny" \
  -H "Authorization: Bearer $TOKEN"

# Full rule + provenance: authoredBy, authorNl, interpreterVersion, approvedBy, approvedAt.
curl -s http://localhost:4000/api/rules/BL8 \
  -H "Authorization: Bearer $TOKEN"
```

## End-to-end flow (one shell session)

```bash
BASE=http://localhost:4000

# Tokens (lead has all three roles, so a single token drives the whole flow).
TOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"lead","password":"lead-pw"}' | jq -r .accessToken)
AUTH="Authorization: Bearer $TOKEN"; JSON='Content-Type: application/json'

# 1. interpret → candidate
curl -s -X POST $BASE/api/authoring/interpret -H "$AUTH" -H "$JSON" \
  -d '{"naturalLanguage":"When the ordering client is NY-regulated, the performing lab must be on the NY-validated lab list.","objects":["order"]}' \
  | jq '.candidate' > candidate.json

# 2. lint → must be { "isValid": true }
curl -s -X POST $BASE/api/authoring/lint -H "$AUTH" -H "$JSON" \
  -d "{\"ruleJson\": $(cat candidate.json)}"

# 3. paraphrase → read it back
curl -s -X POST $BASE/api/authoring/paraphrase -H "$AUTH" -H "$JSON" \
  -d "{\"ruleJson\": $(cat candidate.json)}"

# 4. dry-run → check fixture hits
curl -s -X POST $BASE/api/authoring/dry-run -H "$AUTH" -H "$JSON" \
  -d "{\"ruleJson\": $(cat candidate.json)}"

# 5. create (lints again; 422 on lint error)
curl -s -X POST $BASE/api/rules -H "$AUTH" -H "$JSON" \
  -d "{\"ruleJson\": $(cat candidate.json), \"authorNl\":\"NY-regulated order requires NY-validated lab\", \"interpreterVersion\":\"stub-1\"}"

# 6. approve (recorded approver = authenticated principal)
curl -s -X POST $BASE/api/rules/BL8/approve -H "$AUTH" -H "$JSON" -d '{}'

# 7. promote (enable)
curl -s -X POST $BASE/api/rules/BL8/promote -H "$AUTH"
```

## Worked examples from the corpus

These three rules cover the common shapes. Each is a real file under `rules/`.

### A. Validation with a reference table — `BL8`

*"When the ordering client is NY-regulated, the performing lab must be on the NY-validated lab list."*

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

- **WHEN** the client is NY-regulated (otherwise the rule does not apply).
- **DECISION** the performing lab is eligible for the `TestCompendium.nyValidation` reference set
  (a *reference-eligibility* operator — the list lives in reference data, not the rule).
- **ON FAILURE** raise an informational `ComplianceAlert` scoped to the order; **ON SUCCESS** continue.

### B. Collection quantifier + recovery + hold — `PM13`

*"Each ordered test must have a compatible specimen type per the Test Compendium. If none on the order is
compatible, try to find an alternate specimen; only if none exists, place a complete hold."*

```json
{
  "key": "PM13",
  "priority": 10,
  "phase": "Validate",
  "appliesWhen": { "type": "leaf", "subject": "test.orderedTest", "operator": "IsPresent" },
  "assert":      { "type": "leaf", "subject": "order.specimens[].type",
                   "operator": "IsCompatibleWith", "reference": "TestCompendium.compatibleSpecimens",
                   "quantifier": "Any" },
  "onSuccess":   { "type": "Continue" },
  "recover":     { "strategy": "find-alternate-specimen",
                   "parameters": { "scope": "same-order", "match": "test.orderedTest" } },
  "onFailure":   { "type": "CompleteHold", "scope": "order",
                   "reason": "No viable specimen for ordered test" }
}
```

- **WHEN** an ordered test is present.
- **DECISION** uses `quantifier: "Any"` over the `order.specimens[]` collection — succeeds if **any**
  specimen is compatible (a *matching* operator, reference-backed).
- **RECOVER** before failing, attempt `find-alternate-specimen`; only if recovery cannot resolve it does
  the **ON FAILURE** `CompleteHold` apply. This is the canonical "try to fix, then block" pattern.

### C. Derivation (degenerate, no `assert`) — `BL20`

*"When a specimen is Bone Marrow and has no body site, stamp the body site as Bone Marrow."*

```json
{
  "key": "BL20",
  "priority": 6,
  "phase": "Derive",
  "appliesWhen": {
    "type": "group", "logicalOp": "All",
    "conditions": [
      { "type": "leaf", "subject": "specimen.type", "operator": "Equals", "value": "BoneMarrow" },
      { "type": "leaf", "subject": "specimen.bodySite", "operator": "IsAbsent" }
    ]
  },
  "onSuccess": { "type": "Continue" },
  "onFailure": { "type": "SetValue",
                 "reason": "Body site defaulted to Bone Marrow for Bone Marrow specimen",
                 "parameters": { "Target": "specimen.bodySite", "Value": "BoneMarrow" } }
}
```

- A **derivation** rule has **no `assert`** — so it always "fails through" to `onFailure`, which here is a
  `SetValue` that stamps `specimen.bodySite`. The work is entirely in the WHEN gate (an `All` group of two
  leaves: type is Bone Marrow **and** body site absent).
- It runs in the **`Derive`** phase (priority 6), so the stamped value is visible to later `Validate`/`Route`
  rules. This is how rules chain: one rule's derived fact is another rule's input.

## Authoring checklist

- [ ] Interpretation has acceptable confidence, **no `unmappedPhrases`**, and no unresolved `gaps`.
- [ ] Lint is clean (`isValid: true`, no error-severity findings).
- [ ] Paraphrase reads back as your intended meaning.
- [ ] Dry-run fires on the right fixtures and is silent on the rest.
- [ ] Phase/priority are correct (derivations in `Derive`, before the validations that read them).
- [ ] `onFailure` is present with the right `scope`, and `recover` is set where a fix should be tried first.
- [ ] Created (`201`), approved by a Reviewer, and promoted by an Admin; effective-dated where needed.
