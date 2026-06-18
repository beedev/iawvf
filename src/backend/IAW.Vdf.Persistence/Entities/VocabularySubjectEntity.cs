namespace IAW.Vdf.Persistence.Entities;

/// <summary>
/// A governed, DB-backed vocabulary subject (fact path) row. Subjects are the user-managed portion of the
/// controlled vocabulary: objects/properties can be added or deprecated at runtime without a redeploy.
/// Operators and outcomes remain the engine's closed grammar and are NOT persisted here.
///
/// Lifecycle: a subject is created <see cref="Status"/> = <c>Active</c>; it may be <c>Deprecated</c>
/// (still resolvable so live rules keep working, but hidden from new authoring) and finally retired
/// (row deleted) only when deprecated AND no active rule references it.
/// </summary>
public sealed class VocabularySubjectEntity
{
    /// <summary>Surrogate primary key (uuid).</summary>
    public Guid Id { get; set; }

    /// <summary>The dotted fact path, unique (e.g. <c>"specimen.fixationTime"</c>). Indexed UNIQUE.</summary>
    public required string Path { get; set; }

    /// <summary>The owning object — the first dotted segment with any trailing <c>[]</c> stripped (e.g. <c>"specimen"</c>).</summary>
    public required string ObjectName { get; set; }

    /// <summary>The humanized display label (e.g. <c>"Specimen"</c>, <c>"Medical Review"</c>).</summary>
    public required string Label { get; set; }

    /// <summary>The data type as a string enum: <c>String|Number|Date|Boolean|Collection</c>.</summary>
    public required string DataType { get; set; }

    /// <summary>An optional human description.</summary>
    public string? Description { get; set; }

    /// <summary>Lifecycle status: <c>Active</c> | <c>Deprecated</c>.</summary>
    public required string Status { get; set; }

    /// <summary>Optimistic version number (starts at 1).</summary>
    public int Version { get; set; } = 1;

    /// <summary>When this subject's current definition took effect (timestamptz).</summary>
    public DateTimeOffset EffectiveDate { get; set; }

    /// <summary>Who created the subject (audit; no PHI).</summary>
    public required string CreatedBy { get; set; }

    /// <summary>When the subject row was created (timestamptz).</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Who approved the most recent governance action (nullable until approved/deprecated).</summary>
    public string? ApprovedBy { get; set; }

    /// <summary>When the most recent governance action was approved (nullable).</summary>
    public DateTimeOffset? ApprovedAt { get; set; }
}
