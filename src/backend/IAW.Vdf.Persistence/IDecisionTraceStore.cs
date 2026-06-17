using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Persistence;

/// <summary>
/// Persists <see cref="DecisionTrace"/> records to durable storage for audit / explainability.
/// </summary>
public interface IDecisionTraceStore
{
    /// <summary>Appends a batch of decision traces for a single evaluation run.</summary>
    /// <param name="traces">The traces to persist.</param>
    /// <param name="correlationId">An optional caller-supplied correlation ID linking these traces.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    Task SaveTracesAsync(
        IEnumerable<DecisionTrace> traces,
        string? correlationId = null,
        CancellationToken cancellationToken = default);
}
