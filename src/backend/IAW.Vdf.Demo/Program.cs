using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Time;

// ─────────────────────────────────────────────────────────────────────────────
// IAW VDF Demo — runnable harness over the reference rule corpus.
//
// SINGLE SOURCE OF TRUTH: rules are loaded from <repo>/rules/*.json and reference
// data from <repo>/rules/reference-data.json; fact scenarios are loaded from
// <repo>/fixtures/*.json. Nothing is defined in code, so the demo always reflects
// the committed corpus. The engine is deterministic — re-run for identical output.
//
//   dotnet run --project src/backend/IAW.Vdf.Demo
// ─────────────────────────────────────────────────────────────────────────────

var repoRoot = FindRepoRoot();
var rulesDir = Path.Combine(repoRoot, "rules");
var fixturesDir = Path.Combine(repoRoot, "fixtures");
var referenceDataPath = Path.Combine(rulesDir, "reference-data.json");

if (!Directory.Exists(rulesDir) || !File.Exists(referenceDataPath))
{
    Console.Error.WriteLine($"Could not find the rule corpus. Expected {rulesDir} and {referenceDataPath}.");
    return 1;
}

Console.WriteLine("══════════════════════════════════════════════════════");
Console.WriteLine("  IAW Validation & Decision Framework — Demo");
Console.WriteLine("══════════════════════════════════════════════════════");

var repo = JsonRuleRepository.FromDirectory(rulesDir);
var refs = JsonReferenceDataProvider.FromFile(referenceDataPath);
var clock = new FixedClock(new DateTimeOffset(2026, 6, 17, 12, 0, 0, TimeSpan.Zero));
var engine = new VdfEngine(repo, refs, new RuleSelector(), clock);
var asOf = clock.Now;

var activeRules = (await repo.GetActiveRulesAsync(asOf)).ToList();
Console.WriteLine($"Loaded {activeRules.Count} active rules from rules/ · reference data from rules/reference-data.json");
Console.WriteLine();

var fixtureFiles = Directory.GetFiles(fixturesDir, "*.json").OrderBy(f => f, StringComparer.Ordinal).ToList();

foreach (var file in fixtureFiles)
{
    var label = Path.GetFileNameWithoutExtension(file);
    var facts = FactDocument.Parse(await File.ReadAllTextAsync(file));

    Console.WriteLine($"┌─ Scenario: {label}");

    var result = await engine.EvaluateAsync(new EvaluationRequest
    {
        Trigger = Trigger.OrderEvent("OrderSubmitted"),
        Facts = facts,
        AsOf = asOf,
    });

    // Business-significant outcomes (holds, alerts, routing, entity, control) — not Continue/Suppressed/derivations.
    var significant = result.Outcomes
        .Where(o => o.Group is OutcomeGroup.Validation or OutcomeGroup.Workflow or OutcomeGroup.Entity or OutcomeGroup.Control)
        .ToList();

    if (significant.Count == 0)
    {
        Console.WriteLine("│  ✓ No holds / alerts — order proceeds");
    }
    else
    {
        foreach (var o in significant)
        {
            var scope = o.Scope is not null ? $"[{o.Scope}]" : "";
            Console.WriteLine($"│  ✗ {o.Type}{scope}: {o.Reason ?? "(no reason)"}");
        }
    }

    // Per-rule decision trace (only rules that applied).
    foreach (var t in result.Trace.Where(t => t.Applied))
    {
        var icon = t.AssertResult == true ? "✓" : t.AssertResult == false ? "✗" : "~";
        var produced = t.Produced?.Type.ToString() ?? "nothing";
        Console.WriteLine($"│    [{icon}] {t.RuleKey} → {produced}");
    }

    // Derived facts (rule chaining).
    foreach (var t in result.Trace.Where(t => t.Produced?.Group == OutcomeGroup.Derivation))
    {
        var p = t.Produced!;
        if (p.Parameters.TryGetValue("Target", out var target) && p.Parameters.TryGetValue("Value", out var val))
        {
            Console.WriteLine($"│    ↳ derived: {target} = {val}");
        }
    }

    Console.WriteLine("└──────────────────────────────────────────────────");
}

Console.WriteLine();
Console.WriteLine($"Evaluated {fixtureFiles.Count} scenarios against {activeRules.Count} rules. Engine deterministic — re-run for identical output.");
return 0;

// Walk up from the binary's directory to the repo root (contains src/ and tests/).
static string FindRepoRoot()
{
    var dir = AppContext.BaseDirectory;
    while (dir is not null)
    {
        if (Directory.Exists(Path.Combine(dir, "src")) && Directory.Exists(Path.Combine(dir, "tests")) && Directory.Exists(Path.Combine(dir, "rules")))
        {
            return dir;
        }
        dir = Directory.GetParent(dir)?.FullName;
    }
    return Directory.GetCurrentDirectory();
}
