using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Core.Operators;
using IAW.Vdf.Core.ReferenceData;

namespace IAW.Vdf.Tests;

/// <summary>Unit tests for every operator family, with at least two cases each.</summary>
public sealed class OperatorEvaluatorTests
{
    private readonly IOperatorEvaluator _eval = new OperatorEvaluator();
    private readonly IReferenceDataProvider _refs = new InMemoryReferenceDataProvider()
        .Set("Compat.FFPE", new JsonArray("FISH", "IHC"))
        .Set("Eligible.NY", new JsonArray("Lab-NY-1", "Lab-NY-2"))
        .Set("Exists.flag", JsonValue.Create(true));

    private bool Eval(OperatorKind op, JsonNode? left, JsonNode? right, string? refKey = null)
        => _eval.Evaluate(op, left, right, _refs, refKey);

    // --- Presence ---
    [Fact]
    public void Presence_IsPresent_and_IsAbsent()
    {
        Eval(OperatorKind.IsPresent, JsonValue.Create("x"), null).Should().BeTrue();
        Eval(OperatorKind.IsPresent, null, null).Should().BeFalse();
        Eval(OperatorKind.IsAbsent, null, null).Should().BeTrue();
        Eval(OperatorKind.IsAbsent, JsonValue.Create("x"), null).Should().BeFalse();
    }

    // --- Equality ---
    [Fact]
    public void Equality_Equals_and_NotEquals_with_numeric_coercion()
    {
        Eval(OperatorKind.Equals, JsonValue.Create("FFPE"), JsonValue.Create("FFPE")).Should().BeTrue();
        Eval(OperatorKind.Equals, JsonValue.Create(30), JsonValue.Create(30.0)).Should().BeTrue();
        Eval(OperatorKind.NotEquals, JsonValue.Create("A"), JsonValue.Create("B")).Should().BeTrue();
        Eval(OperatorKind.NotEquals, JsonValue.Create("A"), JsonValue.Create("A")).Should().BeFalse();
    }

    // --- Membership ---
    [Fact]
    public void Membership_InSet_and_NotInSet()
    {
        var set = new JsonArray("FISH-T-001", "FISH-T-002");
        Eval(OperatorKind.InSet, JsonValue.Create("FISH-T-001"), set).Should().BeTrue();
        Eval(OperatorKind.InSet, JsonValue.Create("OTHER"), set).Should().BeFalse();
        Eval(OperatorKind.NotInSet, JsonValue.Create("OTHER"), set).Should().BeTrue();
        Eval(OperatorKind.NotInSet, JsonValue.Create("FISH-T-002"), set).Should().BeFalse();
    }

    // --- Comparison (numeric, date, range) ---
    [Fact]
    public void Comparison_numeric()
    {
        Eval(OperatorKind.GreaterThan, JsonValue.Create(45), JsonValue.Create(30)).Should().BeTrue();
        Eval(OperatorKind.LessThan, JsonValue.Create(10), JsonValue.Create(30)).Should().BeTrue();
        Eval(OperatorKind.GreaterOrEqual, JsonValue.Create(30), JsonValue.Create(30)).Should().BeTrue();
        Eval(OperatorKind.LessOrEqual, JsonValue.Create(30), JsonValue.Create(30)).Should().BeTrue();
    }

    [Fact]
    public void Comparison_dates()
    {
        var later = JsonValue.Create("2026-06-17T00:00:00Z");
        var earlier = JsonValue.Create("2026-01-01T00:00:00Z");
        Eval(OperatorKind.GreaterThan, later, earlier).Should().BeTrue();
        Eval(OperatorKind.LessThan, earlier, later).Should().BeTrue();
    }

    [Fact]
    public void Comparison_WithinRange_inclusive()
    {
        var range = new JsonObject { ["min"] = 10, ["max"] = 50 };
        Eval(OperatorKind.WithinRange, JsonValue.Create(30), range).Should().BeTrue();
        Eval(OperatorKind.WithinRange, JsonValue.Create(10), range).Should().BeTrue();
        Eval(OperatorKind.WithinRange, JsonValue.Create(60), range).Should().BeFalse();
    }

    // --- Matching (regex + reference-backed compatibility) ---
    [Fact]
    public void Matching_Matches_regex()
    {
        Eval(OperatorKind.Matches, JsonValue.Create("ABC-123"), JsonValue.Create("^ABC-\\d+$")).Should().BeTrue();
        Eval(OperatorKind.Matches, JsonValue.Create("XYZ"), JsonValue.Create("^ABC-\\d+$")).Should().BeFalse();
    }

    [Fact]
    public void Matching_IsCompatibleWith_reference()
    {
        Eval(OperatorKind.IsCompatibleWith, JsonValue.Create("FISH"), null, "Compat.FFPE").Should().BeTrue();
        Eval(OperatorKind.IsCompatibleWith, JsonValue.Create("PCR"), null, "Compat.FFPE").Should().BeFalse();
    }

    // --- Reference-eligibility (IsEligibleFor + Exists) ---
    [Fact]
    public void Eligibility_IsEligibleFor_reference()
    {
        Eval(OperatorKind.IsEligibleFor, JsonValue.Create("Lab-NY-1"), null, "Eligible.NY").Should().BeTrue();
        Eval(OperatorKind.IsEligibleFor, JsonValue.Create("Lab-XX"), null, "Eligible.NY").Should().BeFalse();
    }

    [Fact]
    public void Eligibility_Exists_reference_lookup()
    {
        Eval(OperatorKind.Exists, null, null, "Exists.flag").Should().BeTrue();
        Eval(OperatorKind.Exists, null, null, "Exists.missing").Should().BeFalse();
    }
}
