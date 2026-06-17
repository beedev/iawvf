namespace IAW.Vdf.Persistence.Entities;

/// <summary>
/// Stores a single reference-data entry keyed by Source + Key. The value is stored as JSONB to
/// support arbitrary shapes (scalar, array, object). Clients address entries using dotted notation
/// such as <c>"PolicyThresholds.archiveAgeDays"</c>.
/// </summary>
public sealed class ReferenceDataEntity
{
    /// <summary>Surrogate PK (uuid).</summary>
    public Guid Id { get; set; }

    /// <summary>The top-level grouping / namespace (e.g. "PolicyThresholds", "TechnicalFISH").</summary>
    public required string Source { get; set; }

    /// <summary>The key within the source (e.g. "archiveAgeDays"). May be empty for top-level array sources.</summary>
    public required string Key { get; set; }

    /// <summary>The JSON value stored as JSONB (scalar, array, or object).</summary>
    public required string ValueJson { get; set; }
}
