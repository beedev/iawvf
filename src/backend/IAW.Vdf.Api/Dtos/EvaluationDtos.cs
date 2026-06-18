using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Tracing;
using IAW.Vdf.Abstractions.Triggers;

namespace IAW.Vdf.Api.Dtos;

/// <summary>Request to evaluate a facts document against the active rule set.</summary>
public sealed class EvaluateRequest
{
    /// <summary>The facts to evaluate. Must be a JSON object (not an array or scalar).</summary>
    [Required]
    public JsonElement FactsJson { get; set; }

    /// <summary>Optional rule-set filter; when omitted, all active rules are considered.</summary>
    public string? RuleSet { get; set; }

    /// <summary>
    /// Optional trigger type (<c>OrderEvent</c>, <c>TimeSchedule</c>, <c>DecisionReturned</c>).
    /// Defaults to <c>OrderEvent</c>.
    /// </summary>
    public TriggerType? TriggerType { get; set; }
}

/// <summary>An outcome projected for the API response.</summary>
public sealed class OutcomeDto
{
    /// <summary>The outcome type.</summary>
    public required string Type { get; init; }

    /// <summary>The semantic group derived from the type.</summary>
    public required string Group { get; init; }

    /// <summary>The targeted scope (<c>order</c> / <c>test</c> / <c>specimen</c>), if any.</summary>
    public string? Scope { get; init; }

    /// <summary>A human-readable reason.</summary>
    public string? Reason { get; init; }

    /// <summary>An optional severity.</summary>
    public string? Severity { get; init; }

    /// <summary>Effect-specific parameters.</summary>
    public IDictionary<string, object?> Parameters { get; init; } = new Dictionary<string, object?>();

    internal static OutcomeDto From(Outcome o) => new()
    {
        Type = o.Type.ToString(),
        Group = o.Group.ToString(),
        Scope = o.Scope,
        Reason = o.Reason,
        Severity = o.Severity,
        Parameters = o.Parameters,
    };
}

/// <summary>A single leaf-condition trace projected for the API response.</summary>
public sealed class ConditionTraceDto
{
    /// <summary>The subject path evaluated.</summary>
    public required string Subject { get; init; }

    /// <summary>The operator applied.</summary>
    public required string Operator { get; init; }

    /// <summary>The rendered left (subject) value.</summary>
    public string? ResolvedLeft { get; init; }

    /// <summary>The rendered right (comparand) value.</summary>
    public string? ResolvedRight { get; init; }

    /// <summary>The boolean result of the condition.</summary>
    public required bool Result { get; init; }

    internal static ConditionTraceDto From(ConditionTrace c) => new()
    {
        Subject = c.Subject,
        Operator = c.Operator.ToString(),
        ResolvedLeft = c.ResolvedLeft,
        ResolvedRight = c.ResolvedRight,
        Result = c.Result,
    };
}

/// <summary>A per-rule decision trace projected for the API response.</summary>
public sealed class DecisionTraceDto
{
    /// <summary>The rule business key.</summary>
    public required string RuleKey { get; init; }

    /// <summary>The rule version that executed.</summary>
    public required int Version { get; init; }

    /// <summary>The phase the rule ran in.</summary>
    public required string Phase { get; init; }

    /// <summary>Whether the rule applied.</summary>
    public required bool Applied { get; init; }

    /// <summary>The assertion result (null when not applicable).</summary>
    public bool? AssertResult { get; init; }

    /// <summary>The leaf-condition traces.</summary>
    public IReadOnlyList<ConditionTraceDto> Conditions { get; init; } = Array.Empty<ConditionTraceDto>();

    /// <summary>The outcome produced by this rule, if any.</summary>
    public OutcomeDto? Produced { get; init; }

    internal static DecisionTraceDto From(DecisionTrace t) => new()
    {
        RuleKey = t.RuleKey,
        Version = t.Version,
        Phase = t.Phase.ToString(),
        Applied = t.Applied,
        AssertResult = t.AssertResult,
        Conditions = t.Conditions.Select(ConditionTraceDto.From).ToList(),
        Produced = t.Produced is null ? null : OutcomeDto.From(t.Produced),
    };
}

/// <summary>The evaluation response: produced outcomes, the full per-rule trace, and the post-run facts.</summary>
public sealed class EvaluateResponse
{
    /// <summary>The outcomes produced across all evaluated rules, in order.</summary>
    public required IReadOnlyList<OutcomeDto> Outcomes { get; init; }

    /// <summary>The per-rule decision traces, in order.</summary>
    public required IReadOnlyList<DecisionTraceDto> Trace { get; init; }

    /// <summary>The facts after the run, including any derived / stamped values.</summary>
    public required JsonNode? FactsAfter { get; init; }

    internal static EvaluateResponse From(EvaluationResult r) => new()
    {
        Outcomes = r.Outcomes.Select(OutcomeDto.From).ToList(),
        Trace = r.Trace.Select(DecisionTraceDto.From).ToList(),
        FactsAfter = JsonNode.Parse(r.FactsAfter.ToJsonString()),
    };
}
