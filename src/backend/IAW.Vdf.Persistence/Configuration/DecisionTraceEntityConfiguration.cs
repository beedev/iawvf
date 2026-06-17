using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IAW.Vdf.Persistence.Configuration;

/// <summary>EF entity-type configuration for <see cref="DecisionTraceEntity"/>.</summary>
internal sealed class DecisionTraceEntityConfiguration : IEntityTypeConfiguration<DecisionTraceEntity>
{
    public void Configure(EntityTypeBuilder<DecisionTraceEntity> builder)
    {
        builder.ToTable("decision_traces");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasColumnType("uuid")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.CorrelationId)
            .HasColumnName("correlation_id")
            .HasMaxLength(256);

        builder.Property(e => e.RuleKey)
            .HasColumnName("rule_key")
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(e => e.Version)
            .HasColumnName("version");

        builder.Property(e => e.Phase)
            .HasColumnName("phase")
            .HasConversion<string>()
            .HasMaxLength(64);

        builder.Property(e => e.Applied)
            .HasColumnName("applied");

        builder.Property(e => e.AssertResult)
            .HasColumnName("assert_result");

        builder.Property(e => e.ProducedOutcomeJson)
            .HasColumnName("produced_outcome_json")
            .HasColumnType("jsonb");

        builder.Property(e => e.ConditionsJson)
            .HasColumnName("conditions_json")
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(e => e.FactsReadJson)
            .HasColumnName("facts_read_json")
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(e => e.EvaluatedAt)
            .HasColumnName("evaluated_at")
            .HasColumnType("timestamptz");

        builder.HasIndex(e => e.CorrelationId)
            .HasDatabaseName("ix_decision_traces_correlation_id");

        builder.HasIndex(e => e.RuleKey)
            .HasDatabaseName("ix_decision_traces_rule_key");
    }
}
