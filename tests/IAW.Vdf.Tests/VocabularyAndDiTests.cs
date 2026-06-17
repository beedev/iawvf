using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Core.DependencyInjection;
using Microsoft.Extensions.DependencyInjection;

namespace IAW.Vdf.Tests;

/// <summary>Sanity tests for the default vocabulary catalog and DI wiring.</summary>
public sealed class VocabularyAndDiTests
{
    [Fact]
    public void Default_catalog_knows_reference_rule_vocabulary()
    {
        var catalog = VocabularyCatalog.Default();

        catalog.IsKnownSubject("document.circledHE").Should().BeTrue();
        catalog.IsKnownSubject("specimen.age").Should().BeTrue();
        catalog.IsKnownSubject("not.a.subject").Should().BeFalse();

        catalog.IsKnownReference("PolicyThresholds.archiveAgeDays").Should().BeTrue();
        catalog.IsKnownReference("PolicyDefaults.fallbackGender").Should().BeTrue();

        catalog.IsKnownOperator(OperatorKind.IsCompatibleWith).Should().BeTrue();
        catalog.IsKnownOutcome(OutcomeType.CompleteHold).Should().BeTrue();

        // Every operator and outcome type is registered.
        catalog.Operators.Should().HaveCount(Enum.GetValues<OperatorKind>().Length);
        catalog.Outcomes.Should().HaveCount(Enum.GetValues<OutcomeType>().Length);
    }

    [Fact]
    public void AddVdfCore_registers_evaluator()
    {
        var services = new ServiceCollection();
        services.AddVdfCore();
        using var provider = services.BuildServiceProvider();

        provider.GetService<IRuleEvaluator>().Should().NotBeNull();
        provider.GetService<VocabularyCatalog>().Should().NotBeNull();
    }
}
