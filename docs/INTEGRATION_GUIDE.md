# VDF Integration Guide

How a host .NET application embeds the IAW Validation & Decision Framework: which projects to reference,
the DI extensions, the seams you implement, and a minimal end-to-end example.

## What "embedding" means

The VDF is a library, not a service you call over the wire (though `IAW.Vdf.Api` exposes it as one). A host
references the framework projects, registers them in its DI container, implements the seams that connect the
engine to its own domain, and then calls `IRuleEvaluator.EvaluateAsync(...)`. The engine returns *decisions*
(outcomes + trace); the host's `IOutcomeHandler`s carry them out.

## Projects to reference

| You want… | Reference |
|---|---|
| The contracts only (to implement seams, share types) | `IAW.Vdf.Abstractions` |
| The engine + in-memory defaults | `IAW.Vdf.Core` (transitively brings Abstractions) |
| Postgres-backed, versioned, effective-dated rule storage | `IAW.Vdf.Persistence` |
| Compile-time authoring tooling (lint/paraphrase/dry-run) | `IAW.Vdf.Authoring` |
| Natural-language authoring (OpenAI) | `IAW.Vdf.Authoring.Llm` |

A minimal runtime host needs only **Core** (and **Persistence** if rules live in Postgres). Authoring
projects are needed only where rules are *created*, not where they are *evaluated*.

## DI extensions

Register in this order — later calls override earlier defaults (Core uses `TryAdd`, so its in-memory
providers yield to Persistence's EF-backed ones).

```csharp
using IAW.Vdf.Core.DependencyInjection;
using IAW.Vdf.Persistence.DependencyInjection;
using IAW.Vdf.Authoring.DependencyInjection;
using IAW.Vdf.Authoring.Llm.DependencyInjection;

services.AddVdfCore();                          // engine, selector, operators, reconciler,
                                                // default VocabularyCatalog, in-memory providers
services.AddVdfPersistence(connectionString);   // VdfDbContext + EF IRuleRepository / IReferenceDataProvider
services.AddVdfAuthoring();                      // SchemaValidator, VocabularyLinter,
                                                // RoundTripParaphraser, DryRunPreviewer
services.AddVdfLlmInterpreter();                // OpenAiRuleInterpreter as IRuleInterpreter
//   …or, for tests / offline:
// services.AddVdfStubInterpreter();            // deterministic StubRuleInterpreter
```

| Extension | Signature | Registers |
|---|---|---|
| `AddVdfCore` | `(this IServiceCollection)` | `IRuleEvaluator`→`VdfEngine`, `RuleSelector`, `Reconciler`, operators, the default `VocabularyCatalog`, and host-overridable defaults (`IClock`→`SystemClock`, `IRuleRepository`/`IReferenceDataProvider`→in-memory, `IFactProvider`→pass-through). |
| `AddVdfPersistence` | `(this IServiceCollection, string connectionString)` | `VdfDbContext` (Npgsql), EF `IRuleRepository`/`IReferenceDataProvider`, the append-only decision-trace store, and the corpus importer — all scoped. |
| `AddVdfAuthoring` | `(this IServiceCollection)` | The four authoring tools as singletons. |
| `AddVdfLlmInterpreter` | `(this IServiceCollection, Action<OpenAiOptions>? configure = null)` | The live OpenAI `IRuleInterpreter` + a named `HttpClient`; binds `OpenAiOptions` (env vars override). |
| `AddVdfStubInterpreter` | `(this IServiceCollection)` | An offline deterministic `IRuleInterpreter` (no network). |

> **Lifetime note.** The engine and the reference-data-dependent authoring services are registered as
> singletons by Core/Authoring, but the EF repositories from Persistence are scoped (they own a
> request-scoped `DbContext`). A host that wires Persistence behind the engine must re-register the engine
> (and linter/previewer) as **scoped** to avoid a captive dependency — see `IAW.Vdf.Api/Program.cs` for the
> exact pattern (it removes the singleton descriptors and re-adds them scoped). For a non-DI host that
> constructs `VdfEngine` directly (below), this does not arise.

## Implementing the seams

You typically implement two seams; the rest have sensible defaults.

### `IFactProvider` — assemble facts from your domain

The engine evaluates a `FactDocument` (a JSON object addressed by dotted paths). Your provider turns a
trigger into that document — usually by loading your aggregate and projecting the fields the rules
reference.

```csharp
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Triggers;

public sealed class OrderFactProvider(IOrderStore orders) : IFactProvider
{
    public async Task<FactDocument> AssembleAsync(Trigger trigger, CancellationToken ct = default)
    {
        var order = await orders.LoadAsync(trigger.EventName, ct);   // your domain
        return FactDocument.Parse($$"""
        {
          "order": {
            "client":        { "nyStatus": "{{order.Client.NyStatus}}" },
            "performingLab":  "{{order.PerformingLab}}",
            "type":          "{{order.Type}}",
            "specimens":     {{order.SpecimensAsJsonArray}}
          },
          "patient": { "age": {{order.Patient.Age}}, "gender": "{{order.Patient.Gender}}" }
        }
        """);
    }
}
```

Register it so it overrides the pass-through default: `services.AddScoped<IFactProvider, OrderFactProvider>();`

### `IOutcomeHandler` — act on outcomes

This is the side-effect boundary. Implement `CanHandle` to claim outcome types, and `HandleAsync` to
perform the real-world effect. Register one handler per concern; the engine dispatches each outcome to the
handlers that claim it.

```csharp
using IAW.Vdf.Abstractions.Outcomes;

public sealed class HoldOutcomeHandler(IOrderWorkflow workflow) : IOutcomeHandler
{
    public bool CanHandle(OutcomeType type) =>
        type is OutcomeType.CompleteHold or OutcomeType.PartialHold;

    public async Task HandleAsync(Outcome outcome, EvaluationContext ctx, CancellationToken ct = default)
    {
        // outcome.Scope ("order"/"test"/"specimen"), outcome.Reason, outcome.Parameters are all available.
        await workflow.PlaceHoldAsync(scope: outcome.Scope!, reason: outcome.Reason, ct);
    }
}
```

Register: `services.AddScoped<IOutcomeHandler, HoldOutcomeHandler>();` (add as many as you have concerns —
routing, placeholder creation, etc.). Derivation outcomes (`SetValue` and friends) are applied to the fact
document by the engine itself and need no handler.

The other seams — `IRuleRepository` (use Persistence), `IReferenceDataProvider` (use Persistence or a JSON
file), `IClock` (default `SystemClock`; inject `FixedClock` in tests), `IRuleInterpreter` (authoring only) —
are usually satisfied by the framework defaults.

## Minimal end-to-end example

Constructing the engine directly (no DI) — the pattern `IAW.Vdf.Demo` uses. Swap `JsonRuleRepository` /
`JsonReferenceDataProvider` for the EF-backed ones (via DI) in a Postgres-backed host.

```csharp
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Time;

// 1. Wire the engine. In production the repository/reference-data come from Postgres via DI;
//    here we load the committed corpus from disk for a self-contained example.
var repo   = JsonRuleRepository.FromDirectory("rules");
var refs   = JsonReferenceDataProvider.FromFile("rules/reference-data.json");
var clock  = new FixedClock(new DateTimeOffset(2026, 6, 17, 12, 0, 0, TimeSpan.Zero));
var engine = new VdfEngine(repo, refs, new RuleSelector(), clock);
//          (a fifth ctor arg — IEnumerable<IOutcomeHandler> — wires side-effect handlers)

// 2. Assemble facts (your IFactProvider would do this from the host domain).
var facts = FactDocument.Parse("""
{
  "order": { "client": { "nyStatus": "NYRegulated" }, "performingLab": "Lab-CA-1" }
}
""");

// 3. Evaluate.
EvaluationResult result = await engine.EvaluateAsync(new EvaluationRequest
{
    Trigger = Trigger.OrderEvent("OrderSubmitted"),
    Facts   = facts,
    AsOf    = clock.Now,
});

// 4. Read business-significant outcomes (skip Continue/Suppressed and derivations).
foreach (var o in result.Outcomes.Where(o =>
             o.Group is OutcomeGroup.Validation or OutcomeGroup.Workflow
                     or OutcomeGroup.Entity     or OutcomeGroup.Control))
{
    Console.WriteLine($"{o.Type} [{o.Scope}]: {o.Reason}");
    // → ComplianceAlert [order]: Performing lab not on NY-validated list for NY-regulated client
}

// 5. Read the decision trace (explainability) — every rule that applied, with its assertion result.
foreach (var t in result.Trace.Where(t => t.Applied))
{
    Console.WriteLine($"{t.RuleKey} v{t.Version}: assert={t.AssertResult} → {t.Produced?.Type}");
    foreach (var c in t.Conditions)
        Console.WriteLine($"    {c.Subject} {c.Operator} ⇒ {c.Result}");
}

// 6. Derived facts (rules that stamped values for downstream phases) are in result.FactsAfter.
var bodySite = result.FactsAfter.GetString("specimen.bodySite");
```

When you register `IOutcomeHandler`s and resolve `IRuleEvaluator` from DI, steps 1 and 4 collapse: the
engine dispatches each outcome to its handlers during evaluation, and you typically read only the trace for
auditing. The `EvaluationContext` passed to each handler carries the original `Trigger`, `Facts`, and
`AsOf`.

## Determinism in tests

Inject `FixedClock` and pass an explicit `AsOf`; the engine has no other ambient inputs, so a given
`(rules, facts, as-of)` always produces identical outcomes and trace. This is the basis for the corpus
regression and determinism suites — and for replaying any historical decision by passing the instant at
which it was originally made.
