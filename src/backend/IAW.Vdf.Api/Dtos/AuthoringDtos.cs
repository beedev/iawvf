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
    [MaxLength(4000)] // M3: bound LLM input size to curb cost / DoS via oversized prompts.
    public string NaturalLanguage { get; set; } = string.Empty;

    /// <summary>
    /// Optional OBJECT-level scope: object names (first path segment, e.g. <c>"order"</c>). When supplied
    /// (and <see cref="Properties"/> is empty) the interpreter is grounded only against subjects belonging
    /// to these objects. Ignored when <see cref="Properties"/> is non-empty.
    /// </summary>
    public string[]? Objects { get; set; }

    /// <summary>
    /// Optional PROPERTY-level scope: full subject paths (e.g. <c>"order.client.nyStatus"</c>). When
    /// supplied, the interpreter is grounded only against these exact subjects. Takes precedence over
    /// <see cref="Objects"/>.
    /// </summary>
    public string[]? Properties { get; set; }
}

/// <summary>A single property (subject) within an object, projected for the vocabulary tree.</summary>
public sealed class VocabularyPropertyDto
{
    /// <summary>The full subject path (e.g. <c>"order.client.nyStatus"</c>).</summary>
    public required string Path { get; init; }

    /// <summary>The property name relative to its object (the path minus the object prefix, e.g. <c>"client.nyStatus"</c>).</summary>
    public required string Name { get; init; }

    /// <summary>The subject's data type (<c>SubjectDataType</c> name).</summary>
    public required string DataType { get; init; }
}

/// <summary>An OBJECT grouping its PROPERTIES, projected for the vocabulary tree.</summary>
public sealed class VocabularyObjectDto
{
    /// <summary>The object name (first path segment, e.g. <c>"order"</c>).</summary>
    public required string Name { get; init; }

    /// <summary>The Title-cased display label (e.g. <c>"Order"</c>).</summary>
    public required string Label { get; init; }

    /// <summary>The object's properties, sorted by path.</summary>
    public required IReadOnlyList<VocabularyPropertyDto> Properties { get; init; }
}

/// <summary>
/// The controlled vocabulary projected as an OBJECT → PROPERTY tree for authoring UIs, plus the flat
/// operator and outcome name lists. Subjects are grouped by their first dotted path segment.
/// </summary>
public sealed class VocabularyTreeDto
{
    /// <summary>The objects (subject groups), sorted by name.</summary>
    public required IReadOnlyList<VocabularyObjectDto> Objects { get; init; }

    /// <summary>The legal operator names (<c>OperatorKind</c>), sorted.</summary>
    public required IReadOnlyList<string> Operators { get; init; }

    /// <summary>The legal outcome type names (<c>OutcomeType</c>), sorted.</summary>
    public required IReadOnlyList<string> Outcomes { get; init; }
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
