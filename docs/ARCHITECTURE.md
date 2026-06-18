# VDF Architecture

This document describes the component structure, the runtime evaluation pipeline, the persistence model,
the authoring loop, and how the framework's three core guarantees — **determinism, explainability,
auditability** — are enforced by construction.

## Component diagram

```
                          ┌───────────────────────────────────────────────┐
                          │                 Host application               │
                          │  (IAW.Vdf.Api, IAW.Vdf.Demo, or any .NET app)  │
                          └───────────────────────────────────────────────┘
                                   │ implements seams        │ calls
            ┌──────────────────────┼─────────────────────────┼───────────────────────┐
            ▼                      ▼                          ▼                       ▼
   IFactProvider           IOutcomeHandler            IRuleEvaluator             IRuleInterpreter
   (assemble facts)        (act on outcomes)          .EvaluateAsync()           (NL → rule, authoring)
            │                      ▲                          │                       │
            │                      │                          ▼                       │
            │              ┌───────┴──────────────────────────────────────┐          │
            │              │             IAW.Vdf.Core  (the engine)        │          │
            │              │                                               │          │
            └─ FactDocument┤  RuleSelector ─► VdfEngine ─► OperatorEval    │          │
                           │       │              │            │           │          │
                           │       │              ▼            ▼           │          │
                           │       │          Reconciler   OperatorSemantics          │
                           │       ▼              │                        │          │
                           │  (phase/priority/    ▼                        │          │
                           │   effective-date)  Outcomes + DecisionTrace   │          │
                           └───────┬───────────────────────┬──────────────┘          │
                                   │ IRuleRepository        │ IReferenceDataProvider  │
                                   │ IClock                 │                         │
            ┌──────────────────────┴────────────────────────┴─────────────┐  ┌───────┴──────────────┐
            │            IAW.Vdf.Persistence (EF Core + Postgres)          │  │ IAW.Vdf.Authoring.Llm │
            │  VdfDbContext: rules, rule_versions, reference_data,         │  │ OpenAiRuleInterpreter │
            │  decision_traces (append-only)                              │  │ / StubRuleInterpreter │
            └─────────────────────────────────────────────────────────────┘  └───────────────────────┘
                                   ▲
                                   │ schema-validate · lint · paraphrase · dry-run
                           ┌───────┴───────────────────────────────────────┐
                           │            IAW.Vdf.Authoring (compile-time)    │
                           │  SchemaValidator · VocabularyLinter ·          │
                           │  RoundTripParaphraser · DryRunPreviewer        │
                           └────────────────────────────────────────────────┘

      Everything above depends on IAW.Vdf.Abstractions (contracts: RuleDefinition, FactDocument,
      Outcome, ICondition, the six seams). Abstractions depends on nothing.
```

## The evaluation pipeline

A single call to `IRuleEvaluator.EvaluateAsync(EvaluationRequest)` runs six conceptual stages. The
request carries `{ Trigger, Facts, AsOf, RuleSet? }`; the result carries `{ Outcomes, Trace, FactsAfter }`.

```
  fact assembly ─► select ─► evaluate ─► dispatch ─► reconcile ─► trace
```

1. **Fact assembly** — the host's `IFactProvider` builds a `FactDocument` for the trigger (or supplies it
   directly). A `FactDocument` is a JSON object addressed by dotted paths (`order.client.nyStatus`,
   `order.specimens[].type`).

2. **Select** — `RuleSelector` filters to rules that are `Enabled` and whose effective window contains
   `AsOf` (`effectiveDate` inclusive, `expiryDate` exclusive), then orders them deterministically:
   **phase** (`Derive` → `Validate` → `Route`) → **priority** (ascending) → **key** (ordinal). The order is
   total and stable, so the run is reproducible.

3. **Evaluate** — for each selected rule the engine:
   - tests `appliesWhen` (the WHEN gate). If it does not hold, the rule is recorded as *not applied* and
     skipped.
   - evaluates `assert` (the DECISION). Conditions are evaluated through `OperatorSemantics`, which does
     numeric-then-bool-then-ordinal coercion and consults `IReferenceDataProvider` for reference-backed
     operators. AND/OR are **non-short-circuit** — every leaf is evaluated so the trace is complete.
   - selects `onSuccess` or, on failure, attempts `recover` and then falls back to `onFailure`.

4. **Dispatch** — derivation outcomes (`SetValue`/`ApplyDefault`/`CalculateValue`) are applied to the
   working fact document immediately, so later phases see stamped values (this is why `Derive` runs
   first). Registered `IOutcomeHandler`s are invoked for outcomes they `CanHandle` — the **only**
   side-effect boundary; the engine itself never mutates the outside world.

5. **Reconcile** — the `Reconciler` resolves competing outcomes (e.g. a `CompleteHold` dominates a
   `Warning` on the same scope) into the final outcome set, deterministically.

6. **Trace** — every evaluated rule contributes a `DecisionTrace`: `RuleKey`, `Version`, `Applied`,
   `AssertResult`, the per-leaf `Conditions` (subject, operator, result), the `Produced` outcome, and
   `EvaluatedAt`. `FactsAfter` exposes the post-derivation fact document.

## Persistence model — versioned, effective-dated rules

`VdfDbContext` (Npgsql/Postgres, snake_case columns, `timestamptz`, JSONB bodies) models rules as a stable
identity row with an append-only history of versions.

```
  rules (one row per rule key)                rule_versions (one+ per rule, immutable bodies)
  ┌───────────────────────────┐    1     N    ┌──────────────────────────────────────────────┐
  │ id            uuid  (PK)   │◄─────────────►│ id               uuid (PK)                    │
  │ rule_key      text  (UQ)   │               │ rule_id          uuid (FK → rules, cascade)   │
  │ rule_set      text         │               │ version          int  (UQ with rule_id)       │
  │ name          text         │               │ effective_date   timestamptz (inclusive)      │
  │ description   text         │               │ expiry_date      timestamptz? (exclusive)     │
  │ priority      int          │               │ definition_json  jsonb  (full RuleDefinition) │
  │ phase         text         │               │ author_nl        text   (NL provenance)       │
  │ enabled       bool         │               │ interpreter_version text                      │
  │ created_at    timestamptz  │               │ authored_by      text   (default 'system')    │
  └───────────────────────────┘               │ approved_by      text?                        │
                                               │ approved_at      timestamptz?                 │
  reference_data  (key → jsonb)                │ is_active        bool                         │
  decision_traces (append-only audit)          └──────────────────────────────────────────────┘
```

- **Versioning** — `version` increments per `rule_key` (starts at 1). New versions are *appended*; bodies
  are never edited in place. When a new version becomes effective (`effective_date <= now`), prior active
  versions are flipped to `is_active = false`, so **exactly one version is active per rule** at any
  instant. The composite index `ix_rule_versions_is_active_effective_date` backs the hot "active rules as
  of now" query.
- **Effective dating** — `[effective_date, expiry_date)` is the validity window. `RuleSelector` (Core) and
  `GetActiveRulesAsync` (Persistence) apply the same windowing against `AsOf`, so a future-dated rule does
  not affect today's evaluation — and yesterday's evaluation can be replayed exactly by passing the
  historical `AsOf`.
- **Provenance** — each version records the natural-language source (`author_nl`), the interpreter version
  that produced it, who authored it, and who approved it and when.

## The authoring loop

Authoring turns English into a governed rule version. It is entirely compile-time; the LLM never touches
the runtime evaluation path.

```
   interpret ─► lint ─► paraphrase ─► dry-run ─► govern
```

1. **Interpret** — `IRuleInterpreter.InterpretAsync(nl, vocabulary)` (OpenAI-backed) returns an
   `InterpretationResult`: a candidate `RuleDefinition`, a `Confidence`, the `UnmappedPhrases` it could not
   express in the controlled vocabulary, and `Gaps` (missing concerns the author should resolve).
2. **Lint** — `VocabularyLinter.Lint(rule)` validates subject paths and reference keys against the
   `VocabularyCatalog`/reference data and checks outcome parameter completeness, emitting coded findings
   (e.g. `LINT001` unknown subject, `LINT003` unknown reference). Errors block governance.
3. **Paraphrase** — `RoundTripParaphraser.Paraphrase(rule)` renders the rule back to deterministic English
   for human confirmation ("does this say what you meant?").
4. **Dry-run** — `DryRunPreviewer.PreviewAsync(candidate, fixtures)` evaluates the candidate against the
   committed fixture corpus in a no-side-effects sandbox (a fresh engine over an in-memory repository with a
   collecting handler), returning which fixtures the rule applied to and what it produced.
5. **Govern** — `RuleGovernanceService` persists the version with provenance, supports approval
   (`approved_by`/`approved_at`), effective-dating, and enable/disable. Mutations are role-gated
   (Author / Reviewer / Admin).

## How the guarantees are enforced

### Determinism
- **Time is the only ambient input, and it is injected.** The engine reads "now" exclusively through
  `IClock`; `EvaluationRequest.AsOf` fixes the instant for selection and evaluation. Tests use
  `FixedClock`. There is no `DateTime.Now`, randomness, or culture-sensitive parsing in the evaluation
  path (operator comparisons are ordinal/numeric).
- **Total, stable ordering.** `RuleSelector` orders by phase → priority → ordinal key, so the rule
  sequence — and therefore the derivation chain — is identical on every run.
- **No hidden state.** The engine is a pure function of `(rules, facts, as-of)`. Side effects are confined
  to host `IOutcomeHandler`s, invoked after the decision is made. Re-running a request yields byte-identical
  outcomes and trace (proven by `DeterminismTests`).

### Explainability
- **Every evaluated rule is traced.** A `DecisionTrace` records whether the rule applied, the assertion
  result, and — because AND/OR do **not** short-circuit — *every* leaf condition with its subject,
  operator, and boolean result. You can always answer "why did this order get held?" from the trace alone.
- **Outcomes carry intent.** Each `Outcome` has a `Type`, a derived `Group`, a `Scope`
  (order/test/specimen), a human `Reason`, and typed `Parameters` — enough to render the decision without
  re-running the engine.

### Auditability
- **Rules are versioned and provenanced**, not edited in place. The active version, its NL source,
  interpreter version, author, approver, and effective window are all persisted — so any historical
  decision can be reconstructed (replay with the same `AsOf` against the version that was active then).
- **Decision traces are append-only.** The trace store records what was decided, by which rule version, at
  which instant — a permanent audit log. Audit logging records counts/keys only, never PHI.
