using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IAW.Vdf.Persistence.Configuration;

/// <summary>EF entity-type configuration for <see cref="RuleEntity"/>.</summary>
internal sealed class RuleEntityConfiguration : IEntityTypeConfiguration<RuleEntity>
{
    public void Configure(EntityTypeBuilder<RuleEntity> builder)
    {
        builder.ToTable("rules");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasColumnType("uuid")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.RuleKey)
            .HasColumnName("rule_key")
            .HasMaxLength(256)
            .IsRequired();

        builder.HasIndex(e => e.RuleKey)
            .IsUnique()
            .HasDatabaseName("ix_rules_rule_key");

        builder.Property(e => e.RuleSet)
            .HasColumnName("rule_set")
            .HasMaxLength(256);

        builder.Property(e => e.Name)
            .HasColumnName("name")
            .HasMaxLength(512)
            .IsRequired();

        builder.Property(e => e.Description)
            .HasColumnName("description")
            .HasColumnType("text");

        builder.Property(e => e.Priority)
            .HasColumnName("priority");

        builder.Property(e => e.Phase)
            .HasColumnName("phase")
            .HasConversion<string>()
            .HasMaxLength(64);

        builder.Property(e => e.Enabled)
            .HasColumnName("enabled");

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamptz");

        builder.HasMany(e => e.Versions)
            .WithOne(v => v.Rule)
            .HasForeignKey(v => v.RuleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
