using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Core.Engine;

namespace IAW.Vdf.Tests;

/// <summary>Tests the hold reconciliation lifecycle (open / keep / close), including idempotency.</summary>
public sealed class ReconcilerTests
{
    private readonly Reconciler _reconciler = new();

    [Fact]
    public async Task Pm17_hold_closes_when_circledHE_now_present()
    {
        // Prior run had a PM17 complete hold open.
        var prior = new[] { new OpenItem("PM17", Outcome.CompleteHold("order", "missing")) };

        // Current run: circled H&E present, so PM17 does not fail (no hold produced).
        var facts = FactDocument.Parse("""
            { "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" } },
              "document": { "circledHE": "slide-123" } }
            """);
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm17());
        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        var reconciliation = _reconciler.Reconcile(prior, result);

        reconciliation.Closed.Should().ContainSingle();
        reconciliation.Closed[0].Identity.Should().Be(("PM17", OutcomeType.CompleteHold, "order"));
        reconciliation.Opened.Should().BeEmpty();
        reconciliation.Kept.Should().BeEmpty();
    }

    [Fact]
    public async Task Pm17_hold_kept_when_still_firing()
    {
        var prior = new[] { new OpenItem("PM17", Outcome.CompleteHold("order", "missing")) };

        var facts = FactDocument.Parse("""
            { "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" } } }
            """);
        var (engine, _) = TestHelpers.Build(TestHelpers.Pm17());
        var result = await engine.EvaluateAsync(TestHelpers.Request(facts));

        var reconciliation = _reconciler.Reconcile(prior, result);

        reconciliation.Kept.Should().ContainSingle();
        reconciliation.Closed.Should().BeEmpty();
        reconciliation.Opened.Should().BeEmpty();
    }

    [Fact]
    public void New_hold_opens_when_not_previously_present()
    {
        var prior = Array.Empty<OpenItem>();
        var current = new[] { new OpenItem("PM17", Outcome.CompleteHold("order", "missing")) };

        var reconciliation = _reconciler.Reconcile(prior, current);

        reconciliation.Opened.Should().ContainSingle();
        reconciliation.Kept.Should().BeEmpty();
        reconciliation.Closed.Should().BeEmpty();
    }

    [Fact]
    public void Reconcile_is_idempotent()
    {
        var prior = new[] { new OpenItem("PM17", Outcome.CompleteHold("order", "missing")) };
        var current = new[] { new OpenItem("PM48", Outcome.PartialHold("test", "missing date")) };

        var first = _reconciler.Reconcile(prior, current);
        var second = _reconciler.Reconcile(prior, current);

        first.Opened.Select(i => i.Identity).Should().Equal(second.Opened.Select(i => i.Identity));
        first.Closed.Select(i => i.Identity).Should().Equal(second.Closed.Select(i => i.Identity));
        first.Kept.Select(i => i.Identity).Should().Equal(second.Kept.Select(i => i.Identity));
    }
}
