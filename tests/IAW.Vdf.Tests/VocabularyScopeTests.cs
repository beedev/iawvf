using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.Llm.Prompting;

namespace IAW.Vdf.Tests;

/// <summary>
/// Tests for <see cref="VocabularyCatalog.Subset"/> (OBJECT/PROPERTY scoping) and its effect on the
/// interpreter grounding prompt. Scoping narrows subjects only; operators, references, and outcomes stay
/// fully available.
/// </summary>
public sealed class VocabularyScopeTests
{
    [Fact]
    public void Subset_narrows_subjects_but_keeps_operators_outcomes_and_references()
    {
        var catalog = VocabularyCatalog.Default()
            .Subset(new[] { "specimen.type", "specimen.age" });

        // Only the requested subjects survive.
        catalog.Subjects.Should().HaveCount(2);
        catalog.IsKnownSubject("specimen.type").Should().BeTrue();
        catalog.IsKnownSubject("specimen.age").Should().BeTrue();
        catalog.IsKnownSubject("order.type").Should().BeFalse();

        // Operators, outcomes, and references remain fully available.
        catalog.IsKnownOperator(OperatorKind.IsCompatibleWith).Should().BeTrue();
        catalog.IsKnownOutcome(OutcomeType.CompleteHold).Should().BeTrue();
        catalog.IsKnownReference("PolicyThresholds.archiveAgeDays").Should().BeTrue();
        catalog.Operators.Should().HaveCount(Enum.GetValues<OperatorKind>().Length);
        catalog.Outcomes.Should().HaveCount(Enum.GetValues<OutcomeType>().Length);
        catalog.References.Should().HaveCount(VocabularyCatalog.Default().References.Count);
    }

    [Fact]
    public void Subset_intersects_with_known_subjects_and_ignores_unknown_paths()
    {
        var catalog = VocabularyCatalog.Default()
            .Subset(new[] { "specimen.type", "not.a.real.subject" });

        catalog.Subjects.Should().HaveCount(1);
        catalog.IsKnownSubject("specimen.type").Should().BeTrue();
        catalog.IsKnownSubject("not.a.real.subject").Should().BeFalse();
    }

    [Fact]
    public void Subset_with_empty_paths_returns_the_full_catalog_unchanged()
    {
        var full = VocabularyCatalog.Default();

        var same = full.Subset(Array.Empty<string>());

        same.Should().BeSameAs(full);
    }

    [Fact]
    public void Scoped_system_prompt_lists_only_in_scope_subjects()
    {
        var scoped = VocabularyCatalog.Default()
            .Subset(new[] { "specimen.type", "specimen.fixationTime" });

        var prompt = RuleInterpretationPrompt.BuildSystemPrompt(scoped);

        prompt.Should().Contain("specimen.type");
        prompt.Should().Contain("specimen.fixationTime");
        prompt.Should().NotContain("order.product");
        prompt.Should().NotContain("patient.age");
    }
}
