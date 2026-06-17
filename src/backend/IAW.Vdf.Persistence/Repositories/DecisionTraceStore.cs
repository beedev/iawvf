using System.Text.Json;
using IAW.Vdf.Abstractions.Tracing;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Persistence.Entities;

namespace IAW.Vdf.Persistence.Repositories;

/// <summary>
/// Persists <see cref="DecisionTrace"/> records to the <c>decision_traces</c> table.
/// Append-only: no updates or deletes.
/// </summary>
public sealed class DecisionTraceStore : IDecisionTraceStore
{
    private readonly VdfDbContext _db;

    // Reuse the VDF serializer options for outcome serialization (covers polymorphic conditions/outcomes).
    private static readonly JsonSerializerOptions _jsonOptions = RuleSerializer.Options;

    /// <summary>Creates the store over the supplied context.</summary>
    /// <param name="db">The VDF database context.</param>
    public DecisionTraceStore(VdfDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task SaveTracesAsync(
        IEnumerable<DecisionTrace> traces,
        string? correlationId = null,
        CancellationToken cancellationToken = default)
    {
        foreach (var trace in traces)
        {
            var entity = new DecisionTraceEntity
            {
                Id = Guid.NewGuid(),
                CorrelationId = correlationId,
                RuleKey = trace.RuleKey,
                Version = trace.Version,
                Phase = trace.Phase,
                Applied = trace.Applied,
                AssertResult = trace.AssertResult,
                ProducedOutcomeJson = trace.Produced is not null
                    ? JsonSerializer.Serialize(trace.Produced, _jsonOptions)
                    : null,
                ConditionsJson = JsonSerializer.Serialize(trace.Conditions, _jsonOptions),
                FactsReadJson = JsonSerializer.Serialize(trace.FactsRead, _jsonOptions),
                EvaluatedAt = trace.EvaluatedAt,
            };

            _db.DecisionTraces.Add(entity);
        }

        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
