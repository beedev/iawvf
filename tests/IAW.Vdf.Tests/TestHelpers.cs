using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Time;

namespace IAW.Vdf.Tests;

/// <summary>Shared fixtures: a fixed clock, a seeded reference provider, the ten reference rules, and an engine builder.</summary>
internal static class TestHelpers
{
    public static readonly DateTimeOffset FixedNow = new(2026, 6, 17, 12, 0, 0, TimeSpan.Zero);

    public static FixedClock Clock() => new(FixedNow);

    /// <summary>A reference-data provider seeded with the policy values used by the reference rules.</summary>
    public static InMemoryReferenceDataProvider References()
        => new InMemoryReferenceDataProvider()
            .Set("PolicyThresholds.archiveAgeDays", JsonValue.Create(30))
            .Set("PolicyThresholds.pediatricAge", JsonValue.Create(19))
            .Set("PolicyDefaults.fallbackGender", JsonValue.Create("Other"))
            .Set("TechnicalFISH", new JsonArray("FISH-T-001", "FISH-T-002"))
            .Set("TestCompendium.nyValidation", new JsonArray("Lab-NY-1", "Lab-NY-2"));

    /// <summary>Builds an engine over the supplied rules with the seeded references and a fixed clock.</summary>
    public static (VdfEngine Engine, IReferenceDataProvider Refs) Build(
        params RuleDefinition[] rules)
    {
        var refs = References();
        var repo = new InMemoryRuleRepository(rules);
        var engine = new VdfEngine(repo, refs, new RuleSelector(), Clock());
        return (engine, refs);
    }

    public static EvaluationRequest Request(FactDocument facts)
        => new()
        {
            Trigger = Trigger.OrderEvent("OrderSubmitted"),
            Facts = facts,
            AsOf = FixedNow,
        };

    // --- The reference rules (translation-ref #1, #2, #5, #7) ---

    /// <summary>PM17 — Circled H&amp;E required for Technical FISH on FFPE.</summary>
    public static RuleDefinition Pm17() => new()
    {
        Key = "PM17",
        Name = "Circled H&E required for Technical FISH on FFPE",
        Phase = RulePhase.Validate,
        Priority = 10,
        AppliesWhen = GroupCondition.All(
            LeafCondition.Ref("test.code", OperatorKind.InSet, "TechnicalFISH"),
            LeafCondition.Literal("test.specimen.type", OperatorKind.Equals, JsonValue.Create("FFPE"))),
        Assert = LeafCondition.Literal("document.circledHE", OperatorKind.IsPresent),
        OnSuccess = Outcome.Continue(),
        OnFailure = Outcome.CompleteHold("order", "Circled H&E not present for Technical FISH on FFPE"),
    };

    /// <summary>PM48 — Archive retrieval date required for aged specimens.</summary>
    public static RuleDefinition Pm48() => new()
    {
        Key = "PM48",
        Name = "Archive retrieval date required for aged specimens",
        Phase = RulePhase.Validate,
        Priority = 20,
        AppliesWhen = LeafCondition.Ref("specimen.age", OperatorKind.GreaterThan, "PolicyThresholds.archiveAgeDays"),
        Assert = LeafCondition.Literal("specimen.archiveRetrievalDate", OperatorKind.IsPresent),
        OnSuccess = Outcome.Continue(),
        OnFailure = Outcome.PartialHold("test", "Archive retrieval date missing for specimen older than threshold"),
    };

    /// <summary>BL3 — Assign Pediatric priority for patients under 19 (derivation, Derive phase).</summary>
    public static RuleDefinition Bl3() => new()
    {
        Key = "BL3",
        Name = "Assign Pediatric priority for patients under 19",
        Phase = RulePhase.Derive,
        Priority = 10,
        AppliesWhen = LeafCondition.Ref("patient.age", OperatorKind.LessThan, "PolicyThresholds.pediatricAge"),
        Assert = null, // degenerate: no condition to satisfy, only a value to stamp when applicable
        OnFailure = Outcome.DeriveValue("test.priority", "Pediatric"),
    };

    /// <summary>A trivial validation rule that reads the derived test.priority to prove chaining.</summary>
    public static RuleDefinition PediatricChainCheck() => new()
    {
        Key = "CHAIN-PED",
        Name = "Warn when test priority is Pediatric",
        Phase = RulePhase.Validate,
        Priority = 50,
        AppliesWhen = LeafCondition.Literal("test.priority", OperatorKind.Equals, JsonValue.Create("Pediatric")),
        Assert = LeafCondition.Literal("test.priority", OperatorKind.IsAbsent), // always false here -> fires OnFailure
        OnFailure = Outcome.Warning("test", "Pediatric priority detected downstream"),
    };

    /// <summary>BL27 — Default patient gender when absent (apply-default recovery; suppressed on success).</summary>
    public static RuleDefinition Bl27() => new()
    {
        Key = "BL27",
        Name = "Default patient gender when absent",
        Phase = RulePhase.Derive,
        Priority = 5,
        AppliesWhen = null, // always
        Assert = LeafCondition.Literal("patient.gender", OperatorKind.IsPresent),
        Recover = RecoveryStrategy.ApplyDefaultStrategy("patient.gender", reference: "PolicyDefaults.fallbackGender"),
        OnFailure = Outcome.Suppressed("Default applied"),
    };
}
