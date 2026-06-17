using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;

namespace IAW.Vdf.Authoring.Llm.Interpretation;

/// <summary>
/// A deterministic, fully offline <see cref="IRuleInterpreter"/>. It maps a handful of known
/// natural-language phrasings to known corpus rules via simple keyword matching, returning high confidence
/// for a match and a clear gap for anything it does not recognise. It performs no network I/O and always
/// returns the same result for the same input, making it ideal for the automated test suite and as a safe
/// fallback when the live OpenAI interpreter is unavailable.
/// </summary>
public sealed class StubRuleInterpreter : IRuleInterpreter
{
    /// <summary>The interpreter version string, recorded for provenance (HLD §6).</summary>
    public const string InterpreterVersion = "stub-rule-interpreter/1.0.0";

    /// <inheritdoc />
    public Task<InterpretationResult> InterpretAsync(
        string naturalLanguage,
        VocabularyCatalog vocabulary,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(vocabulary);
        var text = (naturalLanguage ?? string.Empty).ToLowerInvariant();

        var result = Match(text) ?? Unrecognized(naturalLanguage);
        return Task.FromResult(result);
    }

    private static InterpretationResult? Match(string text)
    {
        // PM17 — circled H&E required for Technical FISH on FFPE.
        if ((Contains(text, "circled") && Contains(text, "fish")) ||
            (Contains(text, "h&e") && Contains(text, "fish")))
        {
            return Success(BuildPm17(), 0.95);
        }

        // BL46 — follow-up order requires a qualifying initial order.
        if (Contains(text, "follow-up", "follow up", "followup") &&
            (Contains(text, "initial order") || Contains(text, "qualifying")))
        {
            return Success(BuildBl46(), 0.93);
        }

        // BL3 — assign Pediatric priority for patients under 19.
        if (Contains(text, "pediatric") || Contains(text, "under 19") || Contains(text, "under nineteen"))
        {
            return Success(BuildBl3(), 0.9);
        }

        // BL8 — NY-regulated order requires NY-validated performing lab.
        if (Contains(text, "ny", "new york") && Contains(text, "validated", "validation"))
        {
            return Success(BuildBl8(), 0.9);
        }

        return null;
    }

    private static InterpretationResult Success(RuleDefinition rule, double confidence) => new()
    {
        Candidate = rule,
        Confidence = confidence,
        UnmappedPhrases = Array.Empty<string>(),
        Gaps = Array.Empty<string>(),
    };

    private static InterpretationResult Unrecognized(string? naturalLanguage) => new()
    {
        Candidate = null,
        Confidence = 0,
        UnmappedPhrases = string.IsNullOrWhiteSpace(naturalLanguage)
            ? Array.Empty<string>()
            : new[] { naturalLanguage.Trim() },
        Gaps = new[]
        {
            "The offline stub interpreter does not recognise this rule. It maps only a small set of known phrasings " +
            "(circled H&E + FISH, follow-up + initial order, pediatric/under-19, NY + validated). " +
            "Use the live OpenAI interpreter for arbitrary natural language.",
        },
    };

    private static bool Contains(string text, params string[] anyOf) => anyOf.Any(text.Contains);

    // ── Corpus rule builders (mirror rules/*.json) ──────────────────────────────────────────────────

    private static RuleDefinition BuildPm17() => new()
    {
        Key = "PM17",
        Name = "Circled H&E required for Technical FISH on FFPE",
        Description = "A circled H&E slide must be present when a Technical FISH test is ordered on an FFPE specimen.",
        Priority = 10,
        Phase = RulePhase.Validate,
        AppliesWhen = GroupCondition.All(
            LeafCondition.Ref("test.code", OperatorKind.InSet, "TechnicalFISH"),
            LeafCondition.Literal("test.specimen.type", OperatorKind.Equals, JsonValue.Create("FFPE"))),
        Assert = LeafCondition.Literal("document.circledHE", OperatorKind.IsPresent),
        OnSuccess = Outcome.Continue(),
        OnFailure = Outcome.CompleteHold("order", "Circled H&E not present for Technical FISH on FFPE"),
    };

    private static RuleDefinition BuildBl46() => new()
    {
        Key = "BL46",
        Name = "Follow-up order requires qualifying initial order",
        Description = "A follow-up order may only be submitted when a qualifying initial order already exists for the patient; otherwise submission is prevented.",
        Priority = 40,
        Phase = RulePhase.Validate,
        AppliesWhen = LeafCondition.Literal("order.type", OperatorKind.Equals, JsonValue.Create("FollowUp")),
        Assert = LeafCondition.Literal("order.qualifyingInitialOrder", OperatorKind.IsPresent),
        OnSuccess = Outcome.Continue(),
        OnFailure = Outcome.PreventAction("submit-order", "No qualifying initial order exists for this patient"),
    };

    private static RuleDefinition BuildBl3() => new()
    {
        Key = "BL3",
        Name = "Assign Pediatric priority for patients under 19",
        Description = "Stamps test.priority = 'Pediatric' when patient.age < pediatricAge threshold.",
        Priority = 10,
        Phase = RulePhase.Derive,
        AppliesWhen = LeafCondition.Ref("patient.age", OperatorKind.LessThan, "PolicyThresholds.pediatricAge"),
        OnSuccess = Outcome.Continue(),
        OnFailure = Outcome.SetValue("test.priority", "Pediatric", "Pediatric priority derived from patient age"),
    };

    private static RuleDefinition BuildBl8() => new()
    {
        Key = "BL8",
        Name = "NY-regulated order requires NY-validated performing lab",
        Description = "When the ordering client is NY-regulated, the performing lab must be on the NY-validated lab list.",
        Priority = 30,
        Phase = RulePhase.Validate,
        AppliesWhen = LeafCondition.Literal("order.client.nyStatus", OperatorKind.Equals, JsonValue.Create("NYRegulated")),
        Assert = LeafCondition.Ref("order.performingLab", OperatorKind.IsEligibleFor, "TestCompendium.nyValidation"),
        OnSuccess = Outcome.Continue(),
        OnFailure = Outcome.ComplianceAlert("order", "Performing lab not on NY-validated list for NY-regulated client", "informational"),
    };
}
