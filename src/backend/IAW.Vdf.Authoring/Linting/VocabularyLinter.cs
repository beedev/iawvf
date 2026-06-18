using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Core.Serialization;

namespace IAW.Vdf.Authoring.Linting;

/// <summary>Severity of a lint finding.</summary>
public enum FindingSeverity
{
    /// <summary>A potential issue that may indicate a mistake.</summary>
    Warning,

    /// <summary>A definite problem that will likely cause incorrect behaviour.</summary>
    Error
}

/// <summary>A single diagnostic finding from the linter.</summary>
/// <param name="Severity">Severity level of the finding.</param>
/// <param name="Code">Machine-readable code identifying the finding type.</param>
/// <param name="Message">Human-readable description of the issue.</param>
/// <param name="Path">The logical path within the rule where the issue was found.</param>
public sealed record LintFinding(FindingSeverity Severity, string Code, string Message, string Path);

/// <summary>A complete lint report for one rule.</summary>
/// <param name="IsValid">
/// <see langword="true"/> when there are no <see cref="FindingSeverity.Error"/> findings.
/// </param>
/// <param name="Findings">All findings (both errors and warnings).</param>
public sealed record LintReport(bool IsValid, IReadOnlyList<LintFinding> Findings);

/// <summary>
/// Validates a <see cref="RuleDefinition"/> against the <see cref="VocabularyCatalog"/> and an
/// <see cref="IReferenceDataProvider"/>, producing actionable <see cref="LintFinding"/> diagnostics.
/// </summary>
public sealed class VocabularyLinter
{
    private readonly VocabularyCatalog _catalog;
    private readonly IReferenceDataProvider _references;

    /// <summary>
    /// Initializes a new <see cref="VocabularyLinter"/>.
    /// </summary>
    /// <param name="catalog">The vocabulary catalog to validate subjects and outcome types against.</param>
    /// <param name="references">The reference data provider to resolve reference keys against.</param>
    public VocabularyLinter(VocabularyCatalog catalog, IReferenceDataProvider references)
    {
        _catalog = catalog;
        _references = references;
    }

    /// <summary>
    /// Lints an already-deserialized <see cref="RuleDefinition"/>.
    /// </summary>
    /// <param name="rule">The rule to lint.</param>
    /// <returns>A <see cref="LintReport"/> containing all findings.</returns>
    public LintReport Lint(RuleDefinition rule)
    {
        var findings = new List<LintFinding>();

        // Walk all conditions for subject and reference validation.
        if (rule.AppliesWhen is not null)
            LintCondition(rule.AppliesWhen, "appliesWhen", findings);

        if (rule.Assert is not null)
            LintCondition(rule.Assert, "assert", findings);

        // Lint outcomes.
        LintOutcome(rule.OnSuccess, "onSuccess", findings);
        LintOutcome(rule.OnFailure, "onFailure", findings);

        // Lint recovery.
        if (rule.Recover is not null)
            LintRecovery(rule.Recover, findings);

        // LINT101: Assert with trivial OnFailure.
        if (rule.Assert is not null && rule.OnFailure.Type == OutcomeType.Continue)
        {
            findings.Add(new LintFinding(
                FindingSeverity.Warning,
                "LINT101",
                "Rule asserts a condition but OnFailure is Continue — did you mean to produce a hold or alert?",
                "onFailure"));
        }

        // LINT110: Authored scope vs. referenced subjects (non-blocking).
        // Only runs when the author declared a Scope; scopeless rules (Scope == null) are skipped,
        // so the shipped corpus (which has no scope) is unaffected.
        if (rule.Scope is not null)
            LintScope(rule, findings);

        var isValid = !findings.Any(f => f.Severity == FindingSeverity.Error);
        return new LintReport(isValid, findings);
    }

    /// <summary>
    /// Deserializes the JSON then lints; catches JSON deserialization errors as findings.
    /// </summary>
    /// <param name="ruleJson">The JSON text to deserialize and lint.</param>
    /// <returns>A <see cref="LintReport"/> containing all findings.</returns>
    public LintReport LintJson(string ruleJson)
    {
        RuleDefinition rule;
        try
        {
            rule = RuleSerializer.Deserialize(ruleJson);
        }
        catch (Exception ex)
        {
            var finding = new LintFinding(
                FindingSeverity.Error,
                "LINT000",
                $"Failed to deserialize rule JSON: {ex.Message}",
                "");
            return new LintReport(false, new[] { finding });
        }

        return Lint(rule);
    }

    // ── Private helpers ──────────────────────────────────────────────────────────────────────────

    private void LintCondition(ICondition condition, string path, List<LintFinding> findings)
    {
        switch (condition)
        {
            case LeafCondition leaf:
                LintLeafCondition(leaf, path, findings);
                break;

            case GroupCondition group:
                for (var i = 0; i < group.Conditions.Count; i++)
                    LintCondition(group.Conditions[i], $"{path}.conditions[{i}]", findings);
                break;
        }
    }

    private void LintLeafCondition(LeafCondition leaf, string path, List<LintFinding> findings)
    {
        // LINT001: Unknown subject path.
        if (!IsKnownSubjectPath(leaf.Subject))
        {
            findings.Add(new LintFinding(
                FindingSeverity.Error,
                "LINT001",
                $"Unknown subject '{leaf.Subject}'",
                $"conditions.{leaf.Subject}"));
        }

        // LINT003: Unknown reference key.
        if (leaf.Reference is not null)
        {
            if (!_catalog.IsKnownReference(leaf.Reference) &&
                !_references.TryResolve(leaf.Reference, out _))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Error,
                    "LINT003",
                    $"Unknown reference '{leaf.Reference}'",
                    $"{path}.reference"));
            }
        }
    }

    private void LintOutcome(Outcome outcome, string path, List<LintFinding> findings)
    {
        // LINT002: Unknown outcome type (all types are in the default catalog, so this fires only for
        // catalogs that don't include all types).
        if (!_catalog.IsKnownOutcome(outcome.Type))
        {
            findings.Add(new LintFinding(
                FindingSeverity.Error,
                "LINT002",
                $"Unknown outcome type '{outcome.Type}'",
                $"{path}.type"));
        }

        // LINT005: CreatePlaceholder without SpecimenType.
        if (outcome.Type == OutcomeType.CreatePlaceholder)
        {
            if (!outcome.Parameters.TryGetValue("SpecimenType", out var st) ||
                st is null || string.IsNullOrWhiteSpace(st?.ToString()))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Error,
                    "LINT005",
                    "CreatePlaceholder outcome missing SpecimenType parameter",
                    $"{path}.parameters.SpecimenType"));
            }
        }

        // LINT006: RouteToReview without Destination.
        if (outcome.Type == OutcomeType.RouteToReview)
        {
            if (!outcome.Parameters.TryGetValue("Destination", out var dest) ||
                dest is null || string.IsNullOrWhiteSpace(dest?.ToString()))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Error,
                    "LINT006",
                    "RouteToReview outcome missing Destination parameter",
                    $"{path}.parameters.Destination"));
            }
        }

        // LINT007: PreventAction without Action.
        if (outcome.Type == OutcomeType.PreventAction)
        {
            if (!outcome.Parameters.TryGetValue("Action", out var action) ||
                action is null || string.IsNullOrWhiteSpace(action?.ToString()))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Error,
                    "LINT007",
                    "PreventAction outcome missing Action parameter",
                    $"{path}.parameters.Action"));
            }
        }

        // LINT008: Derivation outcome without Target.
        if (outcome.Type is OutcomeType.SetValue or OutcomeType.ApplyDefault or OutcomeType.CalculateValue)
        {
            if (!outcome.Parameters.TryGetValue("Target", out var target) ||
                target is null || string.IsNullOrWhiteSpace(target?.ToString()))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Error,
                    "LINT008",
                    "Derivation outcome missing Target parameter",
                    $"{path}.parameters.Target"));
            }
        }

        // LINT102: AllowAction without Action (warning).
        if (outcome.Type == OutcomeType.AllowAction)
        {
            if (!outcome.Parameters.TryGetValue("Action", out var action) ||
                action is null || string.IsNullOrWhiteSpace(action?.ToString()))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Warning,
                    "LINT102",
                    "AllowAction outcome missing Action parameter",
                    $"{path}.parameters.Action"));
            }
        }
    }

    private void LintRecovery(RecoveryStrategy recover, List<LintFinding> findings)
    {
        // LINT004: Reference key in recovery parameters that cannot be resolved.
        if (recover.Parameters.TryGetValue("Reference", out var refVal) &&
            refVal is string refKey &&
            !string.IsNullOrWhiteSpace(refKey))
        {
            if (!_catalog.IsKnownReference(refKey) &&
                !_references.TryResolve(refKey, out _))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Error,
                    "LINT004",
                    $"Recovery references unknown key '{refKey}'",
                    "recover.parameters.Reference"));
            }
        }
    }

    /// <summary>
    /// LINT110 (Warning, non-blocking): cross-checks the author-declared <see cref="RuleScope"/> against
    /// the subjects the rule actually references. A finding is raised when a referenced subject's object
    /// (the first dotted segment, with a trailing <c>[]</c> stripped) is not declared in
    /// <see cref="RuleScope.Objects"/>, or — when <see cref="RuleScope.Properties"/> is non-empty — when a
    /// referenced subject path is not among the declared properties. Never produces an Error, so it cannot
    /// reject a rule; it surfaces drift between the declared scope and the rule body for governance review.
    /// </summary>
    private void LintScope(RuleDefinition rule, List<LintFinding> findings)
    {
        var scope = rule.Scope!;
        var referencedSubjects = new List<string>();
        CollectSubjects(rule.AppliesWhen, referencedSubjects);
        CollectSubjects(rule.Assert, referencedSubjects);

        if (referencedSubjects.Count == 0)
            return;

        var scopedObjects = new HashSet<string>(scope.Objects, StringComparer.Ordinal);
        var scopedProperties = new HashSet<string>(scope.Properties, StringComparer.Ordinal);
        var checkProperties = scopedProperties.Count > 0;

        foreach (var subject in referencedSubjects.Distinct(StringComparer.Ordinal))
        {
            var objectName = ObjectName(subject);

            if (!scopedObjects.Contains(objectName))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Warning,
                    "LINT110",
                    $"Rule references object '{objectName}' (subject '{subject}') which is outside its declared scope objects [{string.Join(", ", scope.Objects)}].",
                    "scope.objects"));
                continue;
            }

            if (checkProperties && !scopedProperties.Contains(subject))
            {
                findings.Add(new LintFinding(
                    FindingSeverity.Warning,
                    "LINT110",
                    $"Rule references subject '{subject}' which is outside its declared scope properties.",
                    "scope.properties"));
            }
        }
    }

    /// <summary>Collects every leaf subject path referenced under a condition (recursively).</summary>
    private static void CollectSubjects(ICondition? condition, List<string> into)
    {
        switch (condition)
        {
            case null:
                return;
            case LeafCondition leaf:
                if (!string.IsNullOrWhiteSpace(leaf.Subject))
                    into.Add(leaf.Subject);
                break;
            case GroupCondition group:
                foreach (var child in group.Conditions)
                    CollectSubjects(child, into);
                break;
        }
    }

    /// <summary>
    /// The object name for a subject path: the first dotted segment with any trailing <c>[]</c>
    /// stripped (e.g. <c>"order.product"</c> → <c>"order"</c>, <c>"order.tests[]"</c> → <c>"order"</c>,
    /// <c>"specimens[].type"</c> → <c>"specimens"</c>).
    /// </summary>
    private static string ObjectName(string subject)
    {
        var dot = subject.IndexOf('.');
        var head = dot < 0 ? subject : subject[..dot];

        var bracket = head.IndexOf("[]", StringComparison.Ordinal);
        return bracket < 0 ? head : head[..bracket];
    }

    /// <summary>
    /// Checks whether a subject path is known in the catalog.
    /// Handles array fan-out patterns: "order.specimens[].type" → checks "order.specimens[]" base.
    /// </summary>
    private bool IsKnownSubjectPath(string subject)
    {
        if (_catalog.IsKnownSubject(subject))
            return true;

        // If the path contains "[]", try the base collection path (everything up to and including "[]").
        var bracketIdx = subject.IndexOf("[]", StringComparison.Ordinal);
        if (bracketIdx >= 0)
        {
            var basePath = subject[..(bracketIdx + 2)]; // includes the "[]"
            if (_catalog.IsKnownSubject(basePath))
                return true;
        }

        return false;
    }
}
