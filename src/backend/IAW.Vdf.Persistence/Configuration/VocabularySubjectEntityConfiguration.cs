using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IAW.Vdf.Persistence.Configuration;

/// <summary>EF entity-type configuration for <see cref="VocabularySubjectEntity"/> (table <c>vocabulary_subjects</c>).</summary>
internal sealed class VocabularySubjectEntityConfiguration : IEntityTypeConfiguration<VocabularySubjectEntity>
{
    public void Configure(EntityTypeBuilder<VocabularySubjectEntity> builder)
    {
        builder.ToTable("vocabulary_subjects");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasColumnType("uuid")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.Path)
            .HasColumnName("path")
            .HasMaxLength(512)
            .IsRequired();

        builder.HasIndex(e => e.Path)
            .IsUnique()
            .HasDatabaseName("ix_vocabulary_subjects_path");

        builder.Property(e => e.ObjectName)
            .HasColumnName("object_name")
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(e => e.Label)
            .HasColumnName("label")
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(e => e.DataType)
            .HasColumnName("data_type")
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(e => e.Description)
            .HasColumnName("description")
            .HasColumnType("text");

        builder.Property(e => e.Status)
            .HasColumnName("status")
            .HasMaxLength(32)
            .IsRequired();

        builder.HasIndex(e => e.Status)
            .HasDatabaseName("ix_vocabulary_subjects_status");

        builder.Property(e => e.Version)
            .HasColumnName("version")
            .HasDefaultValue(1);

        builder.Property(e => e.EffectiveDate)
            .HasColumnName("effective_date")
            .HasColumnType("timestamptz");

        builder.Property(e => e.CreatedBy)
            .HasColumnName("created_by")
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamptz");

        builder.Property(e => e.ApprovedBy)
            .HasColumnName("approved_by")
            .HasMaxLength(256);

        builder.Property(e => e.ApprovedAt)
            .HasColumnName("approved_at")
            .HasColumnType("timestamptz");
    }
}
