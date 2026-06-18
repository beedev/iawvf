using IAW.Vdf.Persistence.Configuration;
using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Persistence;

/// <summary>
/// The EF Core database context for the VDF persistence layer. Uses PostgreSQL (Npgsql) with
/// snake_case column naming. All timestamp columns use <c>timestamptz</c> and JSONB columns store
/// complex JSON blobs.
/// </summary>
public sealed class VdfDbContext : DbContext
{
    /// <summary>Creates a new <see cref="VdfDbContext"/> with the supplied options.</summary>
    /// <param name="options">The EF context options.</param>
    public VdfDbContext(DbContextOptions<VdfDbContext> options) : base(options) { }

    /// <summary>Rule identity rows (one per unique rule key).</summary>
    public DbSet<RuleEntity> Rules => Set<RuleEntity>();

    /// <summary>Versioned rule bodies (one or more per rule).</summary>
    public DbSet<RuleVersionEntity> RuleVersions => Set<RuleVersionEntity>();

    /// <summary>Reference data entries keyed by Source + Key.</summary>
    public DbSet<ReferenceDataEntity> ReferenceData => Set<ReferenceDataEntity>();

    /// <summary>Append-only decision audit traces.</summary>
    public DbSet<DecisionTraceEntity> DecisionTraces => Set<DecisionTraceEntity>();

    /// <summary>Governed vocabulary subjects (user-managed objects/properties).</summary>
    public DbSet<VocabularySubjectEntity> VocabularySubjects => Set<VocabularySubjectEntity>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.ApplyConfiguration(new RuleEntityConfiguration());
        modelBuilder.ApplyConfiguration(new RuleVersionEntityConfiguration());
        modelBuilder.ApplyConfiguration(new ReferenceDataEntityConfiguration());
        modelBuilder.ApplyConfiguration(new DecisionTraceEntityConfiguration());
        modelBuilder.ApplyConfiguration(new VocabularySubjectEntityConfiguration());
    }
}
