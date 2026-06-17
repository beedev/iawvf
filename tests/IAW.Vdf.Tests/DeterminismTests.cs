using IAW.Vdf.Abstractions.Facts;

namespace IAW.Vdf.Tests;

/// <summary>Verifies the engine is deterministic: identical inputs yield identical outcomes and traces (modulo timestamps).</summary>
public sealed class DeterminismTests
{
    [Fact]
    public async Task Same_request_twice_yields_identical_outcomes_and_traces()
    {
        var facts = FactDocument.Parse("""
            { "patient": { "age": 7 },
              "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" } },
              "specimen": { "age": 45 } }
            """);

        var (engine, _) = TestHelpers.Build(
            TestHelpers.Bl3(), TestHelpers.PediatricChainCheck(), TestHelpers.Pm17(), TestHelpers.Pm48());

        var first = await engine.EvaluateAsync(TestHelpers.Request(facts.Clone()));
        var second = await engine.EvaluateAsync(TestHelpers.Request(facts.Clone()));

        // Identical outcome sequence (type + scope).
        first.Outcomes.Select(o => (o.Type, o.Scope))
            .Should().Equal(second.Outcomes.Select(o => (o.Type, o.Scope)));

        // Identical trace sequence (rule key, applied, assert, produced type) — timestamps excluded.
        first.Trace.Select(t => (t.RuleKey, t.Applied, t.AssertResult, t.Produced?.Type))
            .Should().Equal(second.Trace.Select(t => (t.RuleKey, t.Applied, t.AssertResult, t.Produced?.Type)));

        // Identical derived facts.
        first.FactsAfter.ToJsonString().Should().Be(second.FactsAfter.ToJsonString());
    }

    [Fact]
    public async Task Engine_does_not_mutate_caller_facts()
    {
        var facts = FactDocument.Parse("""{ "patient": { "age": 7 }, "test": { } }""");
        var before = facts.ToJsonString();

        var (engine, _) = TestHelpers.Build(TestHelpers.Bl3());
        await engine.EvaluateAsync(TestHelpers.Request(facts));

        facts.ToJsonString().Should().Be(before, "the engine clones facts and must not mutate the caller's document");
    }
}
