using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;

namespace IAW.Vdf.Abstractions.Authoring;

/// <summary>
/// The result of interpreting a natural-language rule into the controlled vocabulary. The implementation
/// is deferred to M4 (Authoring.Llm); this contract is defined here so dependents can compile against it.
/// </summary>
public sealed class InterpretationResult
{
    /// <summary>The compiled candidate rule, if interpretation succeeded.</summary>
    public RuleDefinition? Candidate { get; init; }

    /// <summary>The interpreter's confidence in the candidate, in the range 0..1.</summary>
    public double Confidence { get; init; }

    /// <summary>Phrases from the input that could not be mapped to the vocabulary.</summary>
    public IReadOnlyList<string> UnmappedPhrases { get; init; } = Array.Empty<string>();

    /// <summary>Identified gaps requiring author clarification.</summary>
    public IReadOnlyList<string> Gaps { get; init; } = Array.Empty<string>();
}

/// <summary>
/// Translates plain-English rules into the controlled vocabulary, grounding against a
/// <see cref="VocabularyCatalog"/>. Interface only — implemented in M4.
/// </summary>
public interface IRuleInterpreter
{
    /// <summary>Interprets a natural-language rule.</summary>
    /// <param name="naturalLanguage">The author's plain-English rule.</param>
    /// <param name="vocabulary">The vocabulary to ground against.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The interpretation result.</returns>
    Task<InterpretationResult> InterpretAsync(string naturalLanguage, VocabularyCatalog vocabulary, CancellationToken cancellationToken = default);
}
