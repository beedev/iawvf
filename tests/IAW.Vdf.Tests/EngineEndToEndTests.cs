using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Tests;

/// <summary>End-to-end engine tests against the reference rules (PM17, PM48, BL3 chaining, BL27 recovery).</summary>
public sealed class EngineEndToEndTests
{
    // --- PM17: Complete Hold on missing circled H&E ---

    [Fact]
    public async Task Pm17_missing_circledHE_produces_CompleteHold_on_order()
    {
        var facts = FactDocument.Parse("""
            { "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" } } }
            """);
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm17());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Should().ContainSingle();
        var outcome = result.Outcomes[0];
        outcome.Type.Should().Be(OutcomeType.CompleteHold);
        outcome.Scope.Should().Be("order");

        var trace = result.Trace.Single(t => t.RuleKey == "PM17");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
        trace.Produced!.Type.Should().Be(OutcomeType.CompleteHold);
        trace.FactsRead.Should().ContainKey("document.circledHE");
        trace.Conditions.Should().Contain(c => c.Subject == "document.circledHE" && !c.Result);
    }

    [Fact]
    public async Task Pm17_with_circledHE_continues_no_hold()
    {
        var facts = FactDocument.Parse("""
            { "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" } },
              "document": { "circledHE": "slide-123" } }
            """);
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm17());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Should().ContainSingle();
        result.Outcomes[0].Type.Should().Be(OutcomeType.Continue);
        var trace = result.Trace.Single(t => t.RuleKey == "PM17");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Pm17_does_not_apply_when_not_FFPE()
    {
        var facts = FactDocument.Parse("""
            { "test": { "code": "FISH-T-001", "specimen": { "type": "Fresh" } } }
            """);
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm17());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM17").Applied.Should().BeFalse();
    }

    // --- PM48: Partial Hold via threshold reference ---

    [Fact]
    public async Task Pm48_aged_specimen_missing_date_produces_PartialHold_on_test()
    {
        var facts = FactDocument.Parse("""{ "specimen": { "age": 45 } }""");
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm48());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Should().ContainSingle();
        result.Outcomes[0].Type.Should().Be(OutcomeType.PartialHold);
        result.Outcomes[0].Scope.Should().Be("test");
    }

    [Fact]
    public async Task Pm48_young_specimen_does_not_apply()
    {
        var facts = FactDocument.Parse("""{ "specimen": { "age": 10 } }""");
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm48());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM48").Applied.Should().BeFalse();
    }

    [Fact]
    public async Task Pm48_aged_specimen_with_date_continues()
    {
        var facts = FactDocument.Parse("""
            { "specimen": { "age": 45, "archiveRetrievalDate": "2026-06-01T00:00:00Z" } }
            """);
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm48());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
    }

    // --- BL3: Derivation + chaining ---

    [Fact]
    public async Task Bl3_under_19_stamps_pediatric_priority_and_chains()
    {
        var facts = FactDocument.Parse("""{ "patient": { "age": 7 }, "test": { } }""");
        var (engine, _) = TestHelpers.Build(TestHelpers.Bl3(), TestHelpers.PediatricChainCheck());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        // The derived fact must be visible in FactsAfter.
        result.FactsAfter.GetString("test.priority").Should().Be("Pediatric");

        // A trace entry for BL3 must exist and have produced the derivation.
        var bl3 = result.Trace.Single(t => t.RuleKey == "BL3");
        bl3.Applied.Should().BeTrue();
        bl3.Produced!.Type.Should().Be(OutcomeType.SetValue);

        // The downstream Validate-phase rule read the stamped value and fired (proving chaining).
        result.Outcomes.Should().Contain(o => o.Type == OutcomeType.Warning);
        var chain = result.Trace.Single(t => t.RuleKey == "CHAIN-PED");
        chain.Applied.Should().BeTrue();
    }

    [Fact]
    public async Task Bl3_adult_does_not_stamp_or_chain()
    {
        var facts = FactDocument.Parse("""{ "patient": { "age": 40 }, "test": { } }""");
        var (engine, _) = TestHelpers.Build(TestHelpers.Bl3(), TestHelpers.PediatricChainCheck());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.FactsAfter.GetString("test.priority").Should().BeNull();
        result.Outcomes.Should().NotContain(o => o.Type == OutcomeType.Warning);
    }

    // --- BL27: apply-default recovery suppresses failure ---

    [Fact]
    public async Task Bl27_missing_gender_recovers_and_suppresses()
    {
        var facts = FactDocument.Parse("""{ "patient": { } }""");
        var (engine, _) = TestHelpers.Build(TestHelpers.Bl27());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes.Should().ContainSingle();
        result.Outcomes[0].Type.Should().Be(OutcomeType.Suppressed);
        result.FactsAfter.GetString("patient.gender").Should().Be("Other");

        var trace = result.Trace.Single(t => t.RuleKey == "BL27");
        trace.RecoveryAttempted.Should().BeTrue();
        trace.RecoveryResolved.Should().BeTrue();
    }

    [Fact]
    public async Task Bl27_present_gender_continues_without_recovery()
    {
        var facts = FactDocument.Parse("""{ "patient": { "gender": "Female" } }""");
        var (engine, _) = TestHelpers.Build(TestHelpers.Bl27());

        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        result.Outcomes[0].Type.Should().Be(OutcomeType.Continue);
        result.FactsAfter.GetString("patient.gender").Should().Be("Female");
        result.Trace.Single(t => t.RuleKey == "BL27").RecoveryAttempted.Should().BeFalse();
    }
}
