using System.Text.Json;
using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.Linting;
using IAW.Vdf.Authoring.Schema;
using IAW.Vdf.Core.Serialization;

namespace IAW.Vdf.Authoring.Llm.Interpretation;

/// <summary>
/// The deterministic validation gate that turns a model envelope into a trustworthy
/// <see cref="InterpretationResult"/>. This is the enforcement point for the HLD's "grounding, not guessing"
/// principle (§4): regardless of what the model claimed, a candidate is only returned if it
/// (a) deserializes, (b) passes the rule JSON schema, and (c) lints clean against the live
/// <see cref="VocabularyCatalog"/> with zero <see cref="FindingSeverity.Error"/> findings. Any
/// schema/lint error (unknown subject, operator, reference, or outcome) is converted into a
/// propose-new-term <em>gap</em> and the candidate is suppressed (<see cref="InterpretationResult.Candidate"/>
/// becomes <see langword="null"/>). It contains NO network code, so it is fully unit-testable with a canned
/// model response.
/// </summary>
public sealed class RuleInterpretationGate
{
    private readonly VocabularyCatalog _catalog;
    private readonly SchemaValidator _schema;
    private readonly VocabularyLinter _linter;

    /// <summary>Creates a gate bound to the live catalog and reference data.</summary>
    /// <param name="catalog">The live vocabulary to ground against.</param>
    /// <param name="references">The reference data provider the linter resolves reference keys against.</param>
    public RuleInterpretationGate(VocabularyCatalog catalog, IReferenceDataProvider references)
    {
        _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
        ArgumentNullException.ThrowIfNull(references);
        _schema = new SchemaValidator();
        _linter = new VocabularyLinter(catalog, references);
    }

    /// <summary>
    /// Validates a deserialized model envelope and produces the final interpretation result. This is the
    /// method tests call directly with a canned envelope — no network required.
    /// </summary>
    /// <param name="envelope">The model's structured output.</param>
    /// <returns>A validated <see cref="InterpretationResult"/>; <see cref="InterpretationResult.Candidate"/>
    /// is non-null only when the rule is schema-valid and lint-clean.</returns>
    public InterpretationResult Validate(ModelEnvelope envelope)
    {
        ArgumentNullException.ThrowIfNull(envelope);

        var gaps = new List<string>(envelope.Gaps ?? new List<string>());
        var unmapped = new List<string>(envelope.UnmappedPhrases ?? new List<string>());

        // The model declined to produce a candidate — honour that as-is.
        if (string.IsNullOrWhiteSpace(envelope.CandidateJson))
        {
            if (gaps.Count == 0)
                gaps.Add("The model did not produce a candidate rule and gave no reason; the sentence could not be grounded in the vocabulary.");

            return new InterpretationResult
            {
                Candidate = null,
                Confidence = Clamp(envelope.Confidence),
                UnmappedPhrases = unmapped,
                Gaps = gaps,
            };
        }

        // (a) Schema validation against rule.schema.json (structural correctness).
        var schemaErrors = _schema.Validate(envelope.CandidateJson!);
        if (schemaErrors.Count > 0)
        {
            foreach (var error in schemaErrors)
            {
                gaps.Add($"Proposed rule failed schema validation at '{(string.IsNullOrEmpty(error.Path) ? "(root)" : error.Path)}': {error.Message}");
            }

            return Rejected(unmapped, gaps);
        }

        // (b) Deserialization into a RuleDefinition.
        RuleDefinition candidate;
        try
        {
            candidate = RuleSerializer.Deserialize(envelope.CandidateJson!);
        }
        catch (JsonException ex)
        {
            gaps.Add($"Proposed rule could not be deserialized into a RuleDefinition: {ex.Message}");
            return Rejected(unmapped, gaps);
        }

        // (c) Vocabulary lint — the closed-vocabulary enforcement (no invented terms).
        var lintReport = _linter.Lint(candidate);
        var lintErrors = lintReport.Findings.Where(f => f.Severity == FindingSeverity.Error).ToList();
        var lintWarnings = lintReport.Findings.Where(f => f.Severity == FindingSeverity.Warning).ToList();

        if (lintErrors.Count > 0)
        {
            // Convert each error into a propose-new-term gap; suppress the candidate. No silent invention.
            foreach (var error in lintErrors)
            {
                gaps.Add($"{error.Code}: {error.Message} (at {error.Path}). This term is not in the controlled vocabulary — raise a vocabulary-change request before this rule can be authored.");
            }

            return Rejected(unmapped, gaps);
        }

        // Clean candidate. Dampen confidence if the linter raised warnings (suspicious but not fatal).
        var confidence = Clamp(envelope.Confidence);
        if (lintWarnings.Count > 0)
        {
            confidence *= 0.75;
            foreach (var warning in lintWarnings)
            {
                gaps.Add($"Lint warning {warning.Code}: {warning.Message} (at {warning.Path}). Review before approval.");
            }
        }

        return new InterpretationResult
        {
            Candidate = candidate,
            Confidence = confidence,
            UnmappedPhrases = unmapped,
            Gaps = gaps,
        };
    }

    private static InterpretationResult Rejected(List<string> unmapped, List<string> gaps) => new()
    {
        // Per "no silent invention": reject the candidate entirely when it references unknown terms.
        Candidate = null,
        Confidence = 0,
        UnmappedPhrases = unmapped,
        Gaps = gaps,
    };

    private static double Clamp(double value) => value < 0 ? 0 : value > 1 ? 1 : value;
}
