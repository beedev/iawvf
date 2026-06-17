using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Persistence.Entities;

/// <summary>
/// Append-only audit record for a single rule evaluation. Written by <see cref="DecisionTraceStore"/>
/// after each evaluation pass. Never updated or deleted — a true audit log.
/// </summary>
public sealed class DecisionTraceEntity
{
    /// <summary>Surrogate PK (uuid).</summary>
    public Guid Id { get; set; }

    /// <summary>A caller-supplied correlation ID linking traces from the same evaluation request.</summary>
    public string? CorrelationId { get; set; }

    /// <summary>The rule business key that was evaluated.</summary>
    public required string RuleKey { get; set; }

    /// <summary>The rule version that was active during this evaluation.</summary>
    public int Version { get; set; }

    /// <summary>The execution phase of the rule.</summary>
    public RulePhase Phase { get; set; }

    /// <summary>Whether the rule applied (AppliesWhen held).</summary>
    public bool Applied { get; set; }

    /// <summary>The assertion result. Null when the rule did not apply or had no assertion.</summary>
    public bool? AssertResult { get; set; }

    /// <summary>The outcome produced serialized as JSONB. Null when no outcome was produced.</summary>
    public string? ProducedOutcomeJson { get; set; }

    /// <summary>The condition traces (leaf comparisons) serialized as JSONB array.</summary>
    public required string ConditionsJson { get; set; }

    /// <summary>The facts read during evaluation serialized as JSONB object.</summary>
    public required string FactsReadJson { get; set; }

    /// <summary>When the rule was evaluated (timestamptz).</summary>
    public DateTimeOffset EvaluatedAt { get; set; }
}
