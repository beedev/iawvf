using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Authoring.DryRun;
using IAW.Vdf.Authoring.Linting;

namespace IAW.Vdf.Api.Dtos;

/// <summary>Request to interpret a natural-language rule into the controlled vocabulary.</summary>
public sealed class InterpretRequest
{
    /// <summary>The author's plain-English rule.</summary>
    [Required]
    public string NaturalLanguage { get; set; } = string.Empty;
}

/// <summary>The interpreter result: candidate rule JSON, confidence, and unmapped phrases / gaps.</summary>
public sealed class InterpretResponse
{
    /// <summary>The compiled candidate rule serialized as JSON, or <see langword="null"/> if none.</summary>
    public JsonElement? Candidate { get; init; }

    /// <summary>The interpreter's confidence (0..1).</summary>
    public required double Confidence { get; init; }

    /// <summary>Phrases that could not be mapped to the vocabulary.</summary>
    public IReadOnlyList<string> UnmappedPhrases { get; init; } = Array.Empty<string>();

    /// <summary>Identified gaps requiring author clarification.</summary>
    public IReadOnlyList<string> Gaps { get; init; } = Array.Empty<string>();
}

/// <summary>A request carrying a raw rule JSON object (lint / paraphrase / dry-run).</summary>
public sealed class RuleJsonRequest
{
    /// <summary>The rule definition as a JSON object.</summary>
    [Required]
    public JsonElement RuleJson { get; set; }
}

/// <summary>A single lint finding projected for the API response.</summary>
public sealed class LintFindingDto
{
    /// <summary>Severity (<c>Warning</c> or <c>Error</c>).</summary>
    public required string Severity { get; init; }

    /// <summary>Machine-readable finding code.</summary>
    public required string Code { get; init; }

    /// <summary>Human-readable description.</summary>
    public required string Message { get; init; }

    /// <summary>The logical path within the rule.</summary>
    public required string Path { get; init; }

    internal static LintFindingDto From(LintFinding f) => new()
    {
        Severity = f.Severity.ToString(),
        Code = f.Code,
        Message = f.Message,
        Path = f.Path,
    };
}

/// <summary>The lint report projected for the API response.</summary>
public sealed class LintReportDto
{
    /// <summary>Whether the rule has no error-severity findings.</summary>
    public required bool IsValid { get; init; }

    /// <summary>All findings (errors and warnings).</summary>
    public required IReadOnlyList<LintFindingDto> Findings { get; init; }

    internal static LintReportDto From(LintReport r) => new()
    {
        IsValid = r.IsValid,
        Findings = r.Findings.Select(LintFindingDto.From).ToList(),
    };
}

/// <summary>The paraphrase response.</summary>
public sealed class ParaphraseResponse
{
    /// <summary>A deterministic English description of the rule.</summary>
    public required string Paraphrase { get; init; }
}

/// <summary>A single dry-run hit projected for the API response.</summary>
public sealed class DryRunHitDto
{
    /// <summary>The fixture name.</summary>
    public required string FixtureName { get; init; }

    /// <summary>Whether the rule applied to this fixture.</summary>
    public required bool Applied { get; init; }

    /// <summary>The produced outcome type, if any.</summary>
    public string? Produced { get; init; }

    /// <summary>The produced outcome reason, if any.</summary>
    public string? Reason { get; init; }

    internal static DryRunHitDto From(DryRunHit h) => new()
    {
        FixtureName = h.FixtureName,
        Applied = h.Applied,
        Produced = h.Produced?.ToString(),
        Reason = h.Reason,
    };
}

/// <summary>The dry-run response over the repo fixtures corpus.</summary>
public sealed class DryRunResponse
{
    /// <summary>The number of fixtures evaluated.</summary>
    public required int Evaluated { get; init; }

    /// <summary>Per-fixture hit records.</summary>
    public required IReadOnlyList<DryRunHitDto> Hits { get; init; }

    internal static DryRunResponse From(DryRunResult r) => new()
    {
        Evaluated = r.Evaluated,
        Hits = r.Hits.Select(DryRunHitDto.From).ToList(),
    };
}
