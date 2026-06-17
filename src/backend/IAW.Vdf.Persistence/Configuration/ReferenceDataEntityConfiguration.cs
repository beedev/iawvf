using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IAW.Vdf.Persistence.Configuration;

/// <summary>EF entity-type configuration for <see cref="ReferenceDataEntity"/>.</summary>
internal sealed class ReferenceDataEntityConfiguration : IEntityTypeConfiguration<ReferenceDataEntity>
{
    public void Configure(EntityTypeBuilder<ReferenceDataEntity> builder)
    {
        builder.ToTable("reference_data");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasColumnType("uuid")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.Source)
            .HasColumnName("source")
            .HasMaxLength(512)
            .IsRequired();

        builder.Property(e => e.Key)
            .HasColumnName("key")
            .HasMaxLength(512)
            .IsRequired();

        builder.HasIndex(e => new { e.Source, e.Key })
            .IsUnique()
            .HasDatabaseName("ix_reference_data_source_key");

        builder.Property(e => e.ValueJson)
            .HasColumnName("value_json")
            .HasColumnType("jsonb")
            .IsRequired();
    }
}
