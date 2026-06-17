using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IAW.Vdf.Persistence.Configuration;

/// <summary>EF entity-type configuration for <see cref="RuleVersionEntity"/>.</summary>
internal sealed class RuleVersionEntityConfiguration : IEntityTypeConfiguration<RuleVersionEntity>
{
    public void Configure(EntityTypeBuilder<RuleVersionEntity> builder)
    {
        builder.ToTable("rule_versions");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasColumnType("uuid")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.RuleId)
            .HasColumnName("rule_id")
            .HasColumnType("uuid")
            .IsRequired();

        builder.Property(e => e.Version)
            .HasColumnName("version");

        builder.HasIndex(e => new { e.RuleId, e.Version })
            .IsUnique()
            .HasDatabaseName("ix_rule_versions_rule_id_version");

        builder.Property(e => e.EffectiveDate)
            .HasColumnName("effective_date")
            .HasColumnType("timestamptz");

        builder.Property(e => e.ExpiryDate)
            .HasColumnName("expiry_date")
            .HasColumnType("timestamptz");

        builder.Property(e => e.DefinitionJson)
            .HasColumnName("definition_json")
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(e => e.AuthorNl)
            .HasColumnName("author_nl")
            .HasColumnType("text");

        builder.Property(e => e.InterpreterVersion)
            .HasColumnName("interpreter_version")
            .HasMaxLength(128);

        builder.Property(e => e.AuthoredBy)
            .HasColumnName("authored_by")
            .HasMaxLength(256)
            .IsRequired()
            .HasDefaultValue("system");

        builder.Property(e => e.ApprovedBy)
            .HasColumnName("approved_by")
            .HasMaxLength(256);

        builder.Property(e => e.ApprovedAt)
            .HasColumnName("approved_at")
            .HasColumnType("timestamptz");

        builder.Property(e => e.IsActive)
            .HasColumnName("is_active");

        // Composite index for fast active-rule queries filtered by IsActive + EffectiveDate
        builder.HasIndex(e => new { e.IsActive, e.EffectiveDate })
            .HasDatabaseName("ix_rule_versions_is_active_effective_date");
    }
}
