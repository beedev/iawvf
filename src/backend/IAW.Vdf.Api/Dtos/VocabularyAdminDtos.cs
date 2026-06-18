using System.ComponentModel.DataAnnotations;
using IAW.Vdf.Persistence.Entities;
using IAW.Vdf.Persistence.Vocabulary;

namespace IAW.Vdf.Api.Dtos;

/// <summary>A single governed vocabulary subject (admin view, includes deprecated rows).</summary>
public sealed class VocabularySubjectDto
{
    /// <summary>The dotted fact path.</summary>
    public required string Path { get; init; }

    /// <summary>The owning object name (first segment, sans trailing <c>[]</c>).</summary>
    public required string ObjectName { get; init; }

    /// <summary>The humanized display label.</summary>
    public required string Label { get; init; }

    /// <summary>The data type: <c>String|Number|Date|Boolean|Collection</c>.</summary>
    public required string DataType { get; init; }

    /// <summary>An optional description.</summary>
    public string? Description { get; init; }

    /// <summary>Lifecycle status: <c>Active</c> | <c>Deprecated</c>.</summary>
    public required string Status { get; init; }

    /// <summary>Who created the subject.</summary>
    public required string CreatedBy { get; init; }

    /// <summary>When the subject was created.</summary>
    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>Who approved the most recent governance action (nullable).</summary>
    public string? ApprovedBy { get; init; }

    /// <summary>When the most recent governance action was approved (nullable).</summary>
    public DateTimeOffset? ApprovedAt { get; init; }

    /// <summary>Projects an entity into a DTO.</summary>
    /// <param name="e">The entity.</param>
    /// <returns>The DTO.</returns>
    public static VocabularySubjectDto From(VocabularySubjectEntity e) => new()
    {
        Path = e.Path,
        ObjectName = e.ObjectName,
        Label = e.Label,
        DataType = e.DataType,
        Description = e.Description,
        Status = e.Status,
        CreatedBy = e.CreatedBy,
        CreatedAt = e.CreatedAt,
        ApprovedBy = e.ApprovedBy,
        ApprovedAt = e.ApprovedAt,
    };
}

/// <summary>An object grouping its properties (admin tree view).</summary>
public sealed class VocabularyObjectGroupDto
{
    /// <summary>The object name.</summary>
    public required string Name { get; init; }

    /// <summary>The humanized object label.</summary>
    public required string Label { get; init; }

    /// <summary>The properties (subjects) belonging to this object, including deprecated ones.</summary>
    public required IReadOnlyList<VocabularySubjectDto> Properties { get; init; }
}

/// <summary>The full admin vocabulary listing (objects → properties, all statuses).</summary>
public sealed class VocabularyAdminListDto
{
    /// <summary>The objects with their properties.</summary>
    public required IReadOnlyList<VocabularyObjectGroupDto> Objects { get; init; }
}

/// <summary>The request body for creating a new governed subject.</summary>
public sealed class CreateVocabularySubjectRequest
{
    /// <summary>The dotted fact path (e.g. <c>"specimen.colour"</c>). Required.</summary>
    [Required]
    public required string Path { get; init; }

    /// <summary>The data type: <c>String|Number|Date|Boolean|Collection</c>. Required.</summary>
    [Required]
    public required string DataType { get; init; }

    /// <summary>An optional display label; derived from the object name when omitted.</summary>
    public string? Label { get; init; }

    /// <summary>An optional description.</summary>
    public string? Description { get; init; }
}

/// <summary>A rule that references a subject path.</summary>
public sealed class ReferencingRuleDto
{
    /// <summary>The rule key.</summary>
    public required string Key { get; init; }

    /// <summary>The rule name.</summary>
    public required string Name { get; init; }

    /// <summary>Projects an impact row into a DTO.</summary>
    public static ReferencingRuleDto From(ReferencingRule r) => new() { Key = r.Key, Name = r.Name };
}

/// <summary>The impact-analysis response for a subject path.</summary>
public sealed class VocabularyImpactDto
{
    /// <summary>The analyzed subject path.</summary>
    public required string Path { get; init; }

    /// <summary>The active rules that reference the path.</summary>
    public required IReadOnlyList<ReferencingRuleDto> ReferencingRules { get; init; }

    /// <summary>The number of referencing rules.</summary>
    public int Count => ReferencingRules.Count;
}
