using IAW.Vdf.Abstractions.Outcomes;

namespace IAW.Vdf.Core.Outcomes;

/// <summary>
/// An <see cref="IOutcomeHandler"/> that records every outcome it is asked to handle. Useful for tests
/// and for hosts that want to inspect dispatched outcomes. Handles all outcome types by default.
/// </summary>
public sealed class CollectingOutcomeHandler : IOutcomeHandler
{
    private readonly List<Outcome> _handled = new();
    private readonly Func<OutcomeType, bool> _filter;

    /// <summary>Creates a handler that collects all outcome types.</summary>
    public CollectingOutcomeHandler() : this(_ => true)
    {
    }

    /// <summary>Creates a handler that collects only outcomes matching the supplied filter.</summary>
    /// <param name="filter">A predicate selecting which outcome types to handle.</param>
    public CollectingOutcomeHandler(Func<OutcomeType, bool> filter) => _filter = filter;

    /// <summary>The outcomes handled so far, in dispatch order.</summary>
    public IReadOnlyList<Outcome> Handled => _handled;

    /// <inheritdoc />
    public bool CanHandle(OutcomeType type) => _filter(type);

    /// <inheritdoc />
    public Task HandleAsync(Outcome outcome, EvaluationContext ctx, CancellationToken cancellationToken = default)
    {
        _handled.Add(outcome);
        return Task.CompletedTask;
    }
}
