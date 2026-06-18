# Fixtures — sample fact documents

This folder holds **fact documents**: example "transactions" (an order with its test, specimen,
patient, and document) in the same JSON shape you submit to `POST /api/evaluate` or paste into the
**Evaluate** screen. They are the engine's test corpus **and** a live runtime input for the dry-run
feature — so this folder is part of the deliverable and should **not** be deleted.

## Naming convention

Most fixtures come in a pair per rule:

| File | Meaning |
|---|---|
| `<RULE>_fires.json` | Facts crafted so the rule's assertion **fails** → it produces its outcome (e.g. `PM17_fires.json` → Complete Hold). |
| `<RULE>_clean.json` | Facts where the same rule **passes** → no outcome. |

A few files are named scenarios rather than a strict pair (e.g. `All_clear_well_formed_order.json`,
`BL27_missing_gender_recovery.json`) — these exercise a specific behaviour described by their name.

`<RULE>` is the rule key in `../rules/` (e.g. `PM17`, `PM48`, `BL21`, `PM49_DECISION`).

## What a fixture looks like

A plain JSON object keyed by entity (the registry's nouns). Only the fields a rule reads need be
present:

```json
{
  "test":     { "code": "FISH-T-001", "specimen": { "type": "FFPE" }, "orderedTest": "FISH-T-001" },
  "specimen": { "type": "FFPE", "age": 10, "fixationTime": 24 },
  "patient":  { "age": 45, "gender": "Male" },
  "order":    { "client": { "nyStatus": "Standard" }, "performingLab": "Lab-NY-1", "specimens": [ {} ] }
}
```

Field names/types must exist in the **entity registry** (e.g. `specimen.fixationTime` is a `Number`).

## Where they are used

1. **Corpus parity / regression tests** — `src/server/src/vdf/__tests__/corpus-parity.spec.ts` loads
   every `rules/*.json` and asserts each `_fires` fixture yields the expected outcome and each `_clean`
   yields none. This also cross-validates the engine against the original reference behaviour.
2. **Dry-run previewer (runtime)** — `POST /api/authoring/dry-run` (the "Dry-run" button in Authoring)
   runs a *candidate* rule read-only against this corpus to preview which sample transactions it would
   fire on, before the rule is saved. The endpoint loads these files at runtime.
3. They are the conceptual basis for the Evaluate screen's "Load an example" set (the curated UI copies
   live in `src/frontend/src/features/evaluate/scenarios.ts`).

## Adding a fixture

1. Create `<RULE>_fires.json` (facts that should trip the rule) and `<RULE>_clean.json` (facts that
   should not). Keep each one isolated to its rule where possible.
2. Add the expected outcome to the corpus parity test's tables.
3. Make sure every field you use is defined in the entity registry (`rules/` + the seeded registry).
