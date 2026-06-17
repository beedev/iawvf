using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Triggers;

namespace IAW.Vdf.Abstractions.Outcomes;

/// <summary>The context handed to an outcome handler when the engine dispatches a produced outcome.</summary>
public sealed class EvaluationContext
{
    /// <summary>The trigger that initiated the run.</summary>
    public required Trigger Trigger { get; init; }

    /// <summary>The working facts (including derived values) at dispatch time.</summary>
    public required FactDocument Facts { get; init; }

    /// <summary>The instant the run is "as of".</summary>
    public required DateTimeOffset AsOf { get; init; }
}

/// <summary>Acts on a produced outcome. The host supplies implementations that perform real-world effects.</summary>
public interface IOutcomeHandler
{
    /// <summary>Indicates whether this handler can process the given outcome type.</summary>
    /// <param name="type">The outcome type.</param>
    /// <returns><see langword="true"/> if the handler applies.</returns>
    bool CanHandle(OutcomeType type);

    /// <summary>Handles the outcome.</summary>
    /// <param name="outcome">The outcome to handle.</param>
    /// <param name="ctx">The evaluation context.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task representing the operation.</returns>
    Task HandleAsync(Outcome outcome, EvaluationContext ctx, CancellationToken cancellationToken = default);
}
