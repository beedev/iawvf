# Authorship & Evaluation — code map

How a rule is **authored** (compile-time, human-gated) and how facts are **evaluated**
against rules (runtime, deterministic), traced to the actual code. Both flows stand on one
**registry-first foundation**: the entity registry is the single source of truth that
grounds authoring, validates facts, and types every rule subject.

Paths are under `src/server/src` unless noted. Frontend paths are under `src/frontend/src`.

---

## 0. The shared foundation (registry-first)

```
Entity Registry  ──project──>  Subjects (entity.field : type [+allowedValues])
(registry.service)             (rules/vocabulary-projection.service.ts)
      │                                   │
      │                                   ├──> Authoring grounding (closed vocabulary)
      │                                   ├──> Authoring lint (no invented terms)
      └──> Fact validation (Ajv)          └──> Rule subject typing
           (registry/fact-validation.service.ts)
```

- **Registry** — `registry/registry.service.ts`, seeded from `registry/registry.seed-data.ts`
  (entities + typed fields; case-insensitive unique keys).
- **Projection** — `rules/vocabulary-projection.service.ts` turns the registry into the
  legal **subjects** (`entity.field : dataType [+ allowedValues]`).
- **Engine vocabulary** — `vdf/vocabulary.constants.ts` (`OPERATORS`, `OUTCOMES`, closed enums).
- **Reference data** — `rules/db-reference-data.provider.ts` (named thresholds/policies).

Everything below consumes these four.

---

## 1. Authorship flow (compile-time, human-gated)

The interpreter is a **constrained compiler front-end**: the model only *proposes*; a
deterministic gate is the source of truth for validity. Currently scoped to
**Validation-phase** rules (derive/route deferred — see `ARCHITECTURE.md §10`).

```mermaid
sequenceDiagram
    autonumber
    participant UI as AuthoringPage.tsx
    participant API as AuthoringController.interpret
    participant VP as VocabularyProjectionService
    participant RIS as RuleInterpreterService
    participant GR as LlmGroundingService
    participant LLM as OpenAiRuleInterpreter (→ Stub on failure)
    participant GATE as RuleInterpretationGate
    participant LINT as SchemaValidator + VocabularyLinter
    participant SUG as vocabulary-suggester

    UI->>API: POST /api/authoring/interpret { naturalLanguage, objects?, properties? }
    API->>VP: resolveScope(objects, properties)  → scoped subjects (400 if unknown)
    API->>RIS: interpretScoped(nl, subjects)
    RIS->>GR: buildScoped(subjects) → GroundingVocabulary<br/>(subjects + OPERATORS + OUTCOMES + referenceKeys)
    RIS->>LLM: interpret(nl, vocabulary)
    LLM->>LLM: buildSystemPrompt(vocabulary) + OpenAI Structured Outputs (temp 0)
    LLM-->>GATE: ModelEnvelope { candidateJson | null, confidence, gaps, unmappedPhrases, termProposals }
    GATE->>LINT: (a) schema-validate candidateJson  (b) deserialize  (c) registry-grounded lint
    LINT-->>GATE: findings (Errors → suppress candidate; Warnings → dampen confidence)
    GATE-->>RIS: InterpretationResult { candidate, grounding{status,savable,clarification}, gaps, unmappedPhrases }
    API->>SUG: suggestRelevantProperties(nl, subjects) → existing-property suggestions
    API-->>UI: InterpretResponseDto { candidate, confidence, grounding, gaps, vocabularySuggestions }
    Note over UI: Save is enabled ONLY when grounding.savable === true
```

### Step-by-step (with code)

| # | Component | File · entry | What it does |
|---|---|---|---|
| 1 | **Input** | `features/authoring/AuthoringPage.tsx` | Author types NL + optional object scope; `api.interpret(...)`. |
| 2 | **Scope** | `authoring/api/authoring.controller.ts` · `interpret()` → `vocabulary-projection.service.ts` · `resolveScope()` | Resolve the scoped registry subjects; unknown object/property → **400** (never silently scope to nothing). |
| 3 | **Grounding** | `authoring/llm/rule-interpreter.service.ts` · `interpretScoped()` → `llm-grounding.service.ts` · `buildScoped()` | Assemble the **closed** `GroundingVocabulary` = scoped subjects + full `OPERATORS`/`OUTCOMES` + reference keys. |
| 4 | **Model** | `authoring/llm/openai-rule-interpreter.ts` · `interpret()`/`callModel()`/`parseEnvelope()`; prompt in `rule-interpretation-prompt.ts` · `buildSystemPrompt()` | OpenAI Chat Completions, **Structured Outputs** (`json_schema`, `strict`), temp 0 → typed `ModelEnvelope`. On any live failure → `stub-rule-interpreter.ts` (offline, deterministic). |
| 5 | **Gate** | `authoring/llm/rule-interpretation-gate.ts` · `validate()` | Source of truth. (a) `SchemaValidator.validateRule` (rule.schema.json); (b) `deserializeRule`; (c) `VocabularyLinter.lint`. **Any Error → candidate suppressed** (`candidate=null`, propose-new-term gap). Warnings keep candidate, dampen confidence. |
| 5b | **Grounding verdict** | `interpreter.ts` · `summarizeGrounding()` | `grounded` (savable) / `partial` (candidate but a phrase unmapped → not savable, confidence capped) / `ungrounded` (no candidate → confidence 0). Gates the UI **Save**. |
| 6 | **Suggester** | `authoring/vocabulary-suggester.ts` · `suggestRelevantProperties()` | Deterministic: which **existing** registry properties are relevant to the text (field-token + allowed-value overlap). Never invents; empty = "unable to suggest". |
| 7 | **Response** | `authoring/api/authoring.dto.ts` · `InterpretResponseDto.from()` | `{ candidate, confidence, grounding, gaps, unmappedPhrases, vocabularySuggestions }`. |
| 8 | **Round-trip** | `/api/authoring/{paraphrase,lint,dry-run}` | Back-translate, re-lint, and dry-run the candidate against the fixture corpus before saving (read-only). |

### Save & governance

```
UI Save dialog (SaveRuleDialog.tsx — author provides KEY, optional ruleSet)
   │  POST /api/rules
   ▼
RulesController.create()                       [Roles: Author]
   ├─ parseRuleJson()
   ├─ AuthoringService.lint()  ── lint Errors ─▶ 422 (UnprocessableEntity)   ← save-time gate
   └─ RuleRepository.saveAsync(rule, { authoredBy, authorNl, interpreterVersion })
        → new immutable rule_versions row (v1, v2, …), provenance attached
   ▼
Governance: approve → promote → disable   (rules.controller.ts; Reviewer/Admin)
```

The lint gate runs **twice** — at interpret time (suppress) and at save time (**422**) —
so a hand-edited rule can never persist with an unknown term.

---

## 2. Evaluation flow (runtime, deterministic)

Facts in → validate against the registry → run the engine over the **active** rule set →
outcomes + a full decision trace out. No AI at runtime; identical input ⇒ identical output.

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant EV as EvaluationController.evaluate
    participant FV as FactValidationService (Ajv)
    participant RES as RuleEvaluationService
    participant REPO as RuleRepository
    participant ENG as VdfEngine
    participant TS as DecisionTraceStore

    C->>EV: POST /api/evaluate { facts, ruleSet?, asOf? }
    EV->>FV: validate(facts) against per-entity registry schemas → validation block (422 if strict-invalid)
    EV->>RES: evaluateWithRules(facts, { ruleSet, asOf })
    RES->>REPO: getActiveRulesAsync(asOf, ruleSet) → enabled, effective-dated RuleDefinitions
    RES->>ENG: new VdfEngine(rules, referenceData, clock).evaluate(request)
    ENG->>ENG: clone(facts) · selectRules(asOf) → phase(Derive→Validate→Route)/priority/key order
    loop each rule in order
        ENG->>ENG: evaluateRule → appliesWhen guard → assert → recover? → onSuccess|onFailure
        ENG->>ENG: applyDerivationIfAny(outcome) → setPath(facts) (rule chaining)
    end
    ENG-->>RES: { outcomes[], trace[] (per rule), factsAfter }
    RES-->>EV: result + ruleNamesByKey
    EV->>TS: saveResult(result, correlationId)   (audit; NO PHI)
    EV-->>C: EvaluateResponseDto { outcomes, trace, factsAfter, validation }
```

### Step-by-step (with code)

| # | Component | File · entry | What it does |
|---|---|---|---|
| 1 | **Endpoint** | `vdf/api/evaluation.controller.ts` · `evaluate()` | Orchestrates validate → evaluate → persist-trace. |
| 2 | **Fact validation** | `registry/fact-validation.service.ts` | Ajv 2020 per-entity schemas built from the registry; lenient at the boundary (unknown top-level keys skipped), **strict within a known entity** (bad type / bad `allowedValues` → error). |
| 3 | **Load rules** | `rules/rule-evaluation.service.ts` · `evaluateWithRules()` → `rule.repository.ts` · `getActiveRulesAsync(asOf, ruleSet)` | Pulls **enabled**, effective-dated active versions from Postgres; also loads DB reference data. |
| 4 | **Order** | `vdf/selector.ts` · `selectRules()` | Filter by effective/expiry window, then sort: **phase** (`Derive 0 → Validate 1 → Route 2`) → ascending `priority` → `key` (ordinal). Total + stable. |
| 5 | **Per-rule** | `vdf/engine.ts` · `evaluateRule()` | `appliesWhen` (guard; skip if false) → `assert` → if assert fails: `tryRecover()` (`apply-default` writes a default → `Suppressed`; else) → `onFailure`, else `onSuccess`. Conditions via `vdf/conditions.ts` · `evaluateCondition()`. |
| 6 | **Derivation write-back** | `vdf/engine.ts` · `applyDerivationIfAny()` | A `Derivation`-group outcome (`SetValue`/`ApplyDefault`/`CalculateValue`) `setPath(facts, Target, Value)` — later-phase rules observe it (**rule chaining**). |
| 7 | **Trace** | `vdf/engine.ts` · `buildTrace()` → `rules/decision-trace.store.ts` · `saveResult()` | Every evaluated rule emits a `DecisionTrace` (per-leaf resolved values/results, recovery attempts, produced outcome) + `factsAfter`; persisted append-only under a correlation id. **No PHI/facts in logs.** |
| 8 | **Response** | `vdf/api/evaluate.dto.ts` · `EvaluateResponseDto` | `{ outcomes, trace, factsAfter, validation }`. |

### The rule anatomy the engine runs

```
WHEN (appliesWhen)  →  DECISION (assert)
                         ├─ assert TRUE  → ON SUCCESS  (+ derivation write-back)
                         └─ assert FALSE → RECOVER? ──┬─ resolved → SUPPRESSED
                                                      └─ none/failed → ON FAILURE (+ derivation)
```

---

## 3. Where the two flows meet

| Concern | Authoring uses | Evaluation uses |
|---|---|---|
| Subjects (`entity.field` + type + allowed values) | grounding vocabulary + lint (`LINT001`) | fact validation + condition typing |
| Operators / Outcomes (`OPERATORS`/`OUTCOMES`) | grounding + lint (`LINT002`) | engine condition/outcome dispatch |
| Reference keys | grounding + lint (`LINT003/004`) | `apply-default` / reference comparands |
| The rule JSON shape (`rule.schema.json`) | `SchemaValidator` gate | `deserializeRule` load |

The same registry that **grounds what can be authored** also **validates the facts** an
authored rule runs against — so a rule can never reference, nor a fact carry, a term the
registry doesn't own.

### Lint codes (the closed-vocabulary enforcement) — `authoring/vocabulary-linter.ts`

| Code | Sev | Meaning |
|---|---|---|
| `LINT001` | Error | Unknown subject (not a registry `entity.field`) |
| `LINT002` | Error | Unknown outcome type |
| `LINT003` / `LINT004` | Error | Unknown reference key (condition / recovery) |
| `LINT005`/`LINT006`/`LINT007` | Error | Missing required outcome param (CreatePlaceholder / Route Destination / PreventAction Action) |
| `LINT008` | Error | Derivation outcome missing `Target` |
| `LINT020` | Warning | Type-aware operator/value mismatch (registry-typed) |
| `LINT101`/`LINT102` | Warning | assert-with-Continue / AllowAction missing Action |

---

## 4. Cross-cutting guarantees (by construction)

- **No silent invention** — every authored term is gate-checked against the live registry;
  any unknown becomes a *propose-new-term* gap and the candidate is suppressed.
- **AI proposes, determinism decides** — the model never decides validity; the gate (schema
  + lint) and the engine are pure and reproducible.
- **Human-gated** — Save requires `grounding.savable`; persistence re-lints (422); promotion
  is governed (Author → Reviewer → Admin).
- **Auditability** — immutable versioned rules with provenance (`authoredBy`, `authorNl`,
  `interpreterVersion`); append-only decision traces under a correlation id; **no PHI in
  traces or logs.**
