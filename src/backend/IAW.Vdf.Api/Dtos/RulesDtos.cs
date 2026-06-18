using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Persistence.Entities;

namespace IAW.Vdf.Api.Dtos;

/// <summary>A summary view of a stored rule for list / get responses.</summary>
public sealed class RuleSummaryDto
{
    /// <summary>The rule business key.</summary>
    public required string Key { get; init; }

    /// <summary>The rule name.</summary>
    public required string Name { get; init; }

    /// <summary>An optional description.</summary>
    public string? Description { get; init; }

    /// <summary>The owning rule set.</summary>
    public string? RuleSet { get; init; }

    /// <summary>The execution phase.</summary>
    public required string Phase { get; init; }

    /// <summary>Priority within the phase.</summary>
    public required int Priority { get; init; }

    /// <summary>Whether the rule is enabled.</summary>
    public required bool Enabled { get; init; }

    /// <summary>The version number of the version this view represents.</summary>
    public required int Version { get; init; }

    /// <summary>The inclusive effective date.</summary>
    public required DateTimeOffset EffectiveDate { get; init; }

    /// <summary>The exclusive expiry date, if any.</summary>
    public DateTimeOffset? ExpiryDate { get; init; }

    internal static RuleSummaryDto From(RuleDefinition r) => new()
    {
        Key = r.Key,
        Name = r.Name,
        Description = r.Description,
        RuleSet = r.RuleSet,
        Phase = r.Phase.ToString(),
        Priority = r.Priority,
        Enabled = r.Enabled,
        Version = r.Version,
        EffectiveDate = r.EffectiveDate,
        ExpiryDate = r.ExpiryDate,
    };
}

/// <summary>The full rule view: summary plus the raw rule JSON body and governance metadata.</summary>
public sealed class RuleDetailDto
{
    /// <summary>The rule summary.</summary>
    public required RuleSummaryDto Summary { get; init; }

    /// <summary>The full rule definition as JSON.</summary>
    public required JsonNode? RuleJson { get; init; }

    /// <summary>Who authored the active version.</summary>
    public string? AuthoredBy { get; init; }

    /// <summary>The natural-language source (provenance), if recorded.</summary>
    public string? AuthorNl { get; init; }

    /// <summary>The interpreter version that produced this version, if recorded.</summary>
    public string? InterpreterVersion { get; init; }

    /// <summary>Who approved the active version, if approved.</summary>
    public string? ApprovedBy { get; init; }

    /// <summary>When the active version was approved, if approved.</summary>
    public DateTimeOffset? ApprovedAt { get; init; }

    internal static RuleDetailDto From(RuleDefinition r, RuleVersionEntity? meta) => new()
    {
        Summary = RuleSummaryDto.From(r),
        RuleJson = JsonNode.Parse(RuleSerializer.Serialize(r)),
        AuthoredBy = meta?.AuthoredBy,
        AuthorNl = meta?.AuthorNl,
        InterpreterVersion = meta?.InterpreterVersion,
        ApprovedBy = meta?.ApprovedBy,
        ApprovedAt = meta?.ApprovedAt,
    };
}

/// <summary>Request to create / save a rule, carrying optional authoring provenance.</summary>
public sealed class CreateRuleRequest
{
    /// <summary>The rule definition as a JSON object.</summary>
    [Required]
    public JsonElement RuleJson { get; set; }

    /// <summary>Optional natural-language source text (M4 provenance).</summary>
    public string? AuthorNl { get; set; }

    /// <summary>Optional interpreter version that produced the rule (M4 provenance).</summary>
    public string? InterpreterVersion { get; set; }
}

/// <summary>Request to add a new effective-dated version of an existing rule.</summary>
public sealed class AddVersionRequest
{
    /// <summary>The rule definition as a JSON object.</summary>
    [Required]
    public JsonElement RuleJson { get; set; }

    /// <summary>The inclusive effective date for the new version.</summary>
    [Required]
    public DateTimeOffset EffectiveDate { get; set; }
}

/// <summary>Request to approve the active version of a rule.</summary>
public sealed class ApproveRequest
{
    /// <summary>
    /// Optional, display-only approver hint. The persisted audit identity (ApprovedBy) is always the
    /// authenticated principal (JWT name claim), not this field — see H1. Retained for backward
    /// compatibility and human-readable request context only.
    /// </summary>
    public string Approver { get; set; } = string.Empty;
}

/// <summary>The response to a governance mutation (create / approve / version / promote / disable).</summary>
public sealed class RuleMutationResponse
{
    /// <summary>The affected rule key.</summary>
    public required string Key { get; init; }

    /// <summary>The affected version number, when applicable.</summary>
    public int? Version { get; init; }

    /// <summary>A human-readable status message.</summary>
    public required string Message { get; init; }
}
