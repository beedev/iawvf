# VDF Rule Authoring Guide

How to author a rule from plain English, read the interpretation and its gaps, validate it with
lint / paraphrase / dry-run, and govern it through versioning, approval, and effective-dating. The flow is
the same whether you use the React UI or call the API directly; the UI is a thin client over these
endpoints.

> Authoring is **compile-time**. The LLM interpreter translates English into a candidate rule expressed in
> the controlled vocabulary. Once governed and stored, the rule is evaluated by the deterministic engine —
> the LLM is never in the runtime decision path.

## Roles

| Role | Policy | Can do |
|---|---|---|
| **Author** | `CanAuthor` | interpret, lint, paraphrase, dry-run, create rules, add versions |
| **Reviewer** | `CanReview` | approve the active version of a rule |
| **Admin** | `CanAdminister` | enable (promote) / disable a rule |

Obtain a token from `POST /api/auth/login` and send it as `Authorization: Bearer <token>`.

## The authoring loop

```
   interpret ─► lint ─► paraphrase ─► dry-run ─► govern (version → approve → effective-date)
```

### 1. Interpret — English → candidate rule

`POST /api/authoring/interpret` with the natural-language rule. The interpreter returns a candidate
`RuleDefinition` plus three things to read carefully:

- **`confidence`** — how sure the interpreter is it captured your intent.
- **`unmappedPhrases`** — words it could **not** express in the controlled vocabulary. These are the
  highest-signal warnings: if "the performing lab must be accredited" produced an unmapped phrase, the
  vocabulary has no `accredited` concept and the rule will not mean what you wrote.
- **`gaps`** — concerns the rule may be missing (an outcome scope, a recovery path, an effective date).

Treat low confidence, any unmapped phrase, or an unresolved gap as "not done." Edit the English (or the
candidate) and re-interpret until the candidate is clean. (If the interpreter is unavailable the endpoint
returns 503 — author the rule JSON directly and skip to lint.)

### 2. Lint — validate against the vocabulary

`POST /api/authoring/lint` with the candidate rule JSON. `VocabularyLinter` checks that every subject path
and reference key is known, and that each outcome carries its required parameters. It returns a report of
coded findings:

| Code | Meaning |
|---|---|
| `LINT001` | Unknown subject path (not in the vocabulary) |
| `LINT003` | Unknown reference key |
| `LINT005`–`LINT008` | Missing required outcome parameter (e.g. `SetValue` without `Target`/`Value`) |
| `LINT101`/`LINT102` | Warnings (advisory) |

Any **error**-severity finding makes the report invalid — and governance (`POST /api/rules`) will reject
the rule with `422` until it lints clean.

### 3. Paraphrase — confirm intent

`POST /api/authoring/paraphrase` renders the rule back to deterministic English. Read it as a human: does
"When the ordering client is NY-regulated, the performing lab must be eligible for
TestCompendium.nyValidation; otherwise raise a compliance alert on the order" say what you meant? The
paraphrase is the round-trip check that catches subtle operator/scope mistakes that lint cannot.

### 4. Dry-run — see what it does

`POST /api/authoring/dry-run` evaluates the candidate against the committed fixture corpus in a
no-side-effects sandbox. The result lists, per fixture, whether the rule **applied**, what outcome it
**produced**, and the reason. Confirm it fires on the cases it should and stays silent on the cases it
should not — *before* it touches production rules.

### 5. Govern — version, approve, effective-date

| Step | Endpoint | Role |
|---|---|---|
| Create / save (lints first; `422` on lint errors, `201` on success) | `POST /api/rules` | Author |
| Add an effective-dated version (key must match route) | `POST /api/rules/{key}/versions` | Author |
| Approve the active version (stamps approver + timestamp) | `POST /api/rules/{key}/approve` | Reviewer |
| Enable / promote | `POST /api/rules/{key}/promote` | Admin |
| Disable (drops out of evaluation) | `POST /api/rules/{key}/disable` | Admin |

Versions are append-only and provenanced: each records its natural-language source, the interpreter version,
the author, the approver, and the effective window `[effectiveDate, expiryDate)`. A version with
`effectiveDate <= now` becomes the single active version and deactivates its predecessors. To replay a past
decision, evaluate with the historical `asOf` — the engine selects the version that was active then.

Inspect what is live with `GET /api/rules` (list active) and `GET /api/rules/{key}` (detail + active-version
governance metadata).

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
- [ ] Lint is clean (no error-severity findings).
- [ ] Paraphrase reads back as your intended meaning.
- [ ] Dry-run fires on the right fixtures and is silent on the rest.
- [ ] Phase/priority are correct (derivations in `Derive`, before the validations that read them).
- [ ] `onFailure` is present with the right `scope`, and `recover` is set where a fix should be tried first.
- [ ] Saved (`201`), reviewed/approved, and given an `effectiveDate`.
