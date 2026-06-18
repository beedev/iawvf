using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.DryRun;
using IAW.Vdf.Authoring.Linting;
using IAW.Vdf.Authoring.Paraphrase;
using IAW.Vdf.Authoring.Schema;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Serialization;

namespace IAW.Vdf.Tests;

/// <summary>Tests for all M3 Authoring tooling: linter, schema validator, paraphraser, dry-run previewer.</summary>
public sealed class AuthoringTests
{
    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────

    private static string FindDir(string name)
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            var candidate = System.IO.Path.Combine(dir, name);
            if (System.IO.Directory.Exists(candidate))
                return candidate;
            dir = System.IO.Directory.GetParent(dir)?.FullName;
        }
        var abs = $"/Users/bharath/Desktop/NeoGenomics/IAW/{name}";
        if (System.IO.Directory.Exists(abs)) return abs;
        throw new System.IO.DirectoryNotFoundException($"Could not locate '{name}' directory.");
    }

    private static string LoadRuleJson(string key)
    {
        var rulesDir = FindDir("rules");
        return System.IO.File.ReadAllText(System.IO.Path.Combine(rulesDir, $"{key}.json"));
    }

    private static RuleDefinition LoadRule(string key) =>
        RuleSerializer.Deserialize(LoadRuleJson(key));

    private static JsonReferenceDataProvider DiskReferenceData()
    {
        var rulesDir = FindDir("rules");
        return JsonReferenceDataProvider.FromFile(System.IO.Path.Combine(rulesDir, "reference-data.json"));
    }

    private static FactDocument LoadFixture(string name)
    {
        var fixturesDir = FindDir("fixtures");
        var json = System.IO.File.ReadAllText(System.IO.Path.Combine(fixturesDir, $"{name}.json"));
        return FactDocument.Parse(json);
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // VocabularyLinter tests
    // ────────────────────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Consistency invariant: every committed rule in rules/ must lint with NO Error-severity
    /// findings against the default vocabulary. This enforces that the closed vocabulary contains
    /// every subject / reference / outcome the shipped corpus uses (catches corpus↔vocabulary drift).
    /// </summary>
    [Fact]
    public void Every_committed_corpus_rule_lints_without_errors()
    {
        var rulesDir = FindDir("rules");
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var ruleFiles = System.IO.Directory.GetFiles(rulesDir, "*.json")
            .Where(f => !f.EndsWith("reference-data.json", StringComparison.Ordinal))
            .ToList();

        ruleFiles.Should().NotBeEmpty();

        foreach (var file in ruleFiles)
        {
            var rule = RuleSerializer.Deserialize(System.IO.File.ReadAllText(file));
            var report = linter.Lint(rule);
            var errors = report.Findings.Where(f => f.Severity == FindingSeverity.Error).ToList();
            errors.Should().BeEmpty(
                $"corpus rule {rule.Key} must lint clean — unknown terms: {string.Join("; ", errors.Select(e => $"{e.Code} {e.Message}"))}");
        }
    }

    [Fact]
    public void Linter_ValidCorpusRule_PM17_LintClean()
    {
        var rule = LoadRule("PM17");
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.IsValid.Should().BeTrue(
            $"PM17 is a valid reference rule; findings: {string.Join("; ", report.Findings.Select(f => $"{f.Code}: {f.Message}"))}");
        report.Findings.Should().NotContain(f => f.Severity == FindingSeverity.Error);
    }

    [Fact]
    public void Linter_UnknownSubject_ProducesError()
    {
        var rule = new RuleDefinition
        {
            Key = "TEST-001",
            Name = "Unknown subject test",
            Phase = RulePhase.Validate,
            Assert = LeafCondition.Literal("speciment.age", OperatorKind.IsPresent), // typo: "speciment"
            OnFailure = Outcome.Warning("order", "test")
        };
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.IsValid.Should().BeFalse();
        report.Findings.Should().Contain(f => f.Severity == FindingSeverity.Error && f.Code == "LINT001");
    }

    [Fact]
    public void Linter_UnknownReference_ProducesError()
    {
        var rule = new RuleDefinition
        {
            Key = "TEST-002",
            Name = "Unknown reference test",
            Phase = RulePhase.Validate,
            Assert = LeafCondition.Ref("specimen.age", OperatorKind.GreaterThan, "UnknownRefKey"),
            OnFailure = Outcome.Warning("order", "test")
        };
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.IsValid.Should().BeFalse();
        report.Findings.Should().Contain(f => f.Severity == FindingSeverity.Error && f.Code == "LINT003");
    }

    [Fact]
    public void Linter_CreatePlaceholderMissingSpecimenType_ProducesError()
    {
        var rule = new RuleDefinition
        {
            Key = "TEST-003",
            Name = "CreatePlaceholder missing SpecimenType",
            Phase = RulePhase.Validate,
            OnFailure = new Outcome
            {
                Type = OutcomeType.CreatePlaceholder,
                Scope = "order",
                Parameters = new Dictionary<string, object?>() // no SpecimenType
            }
        };
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.IsValid.Should().BeFalse();
        report.Findings.Should().Contain(f => f.Severity == FindingSeverity.Error && f.Code == "LINT005");
    }

    [Fact]
    public void Linter_AssertWithContinueOnFailure_ProducesWarning()
    {
        var rule = new RuleDefinition
        {
            Key = "TEST-004",
            Name = "Assert with Continue OnFailure",
            Phase = RulePhase.Validate,
            Assert = LeafCondition.Literal("patient.gender", OperatorKind.IsPresent),
            OnFailure = Outcome.Continue() // suspicious: assert with Continue
        };
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.Findings.Should().Contain(f => f.Severity == FindingSeverity.Warning && f.Code == "LINT101");
    }

    [Fact]
    public void Linter_ScopeReferencesOutOfScopeObject_ProducesLint110Warning()
    {
        // Scoped to "specimen" but references "order.product" — should warn (non-blocking).
        var rule = new RuleDefinition
        {
            Key = "TEST-SCOPE-1",
            Name = "Scoped to specimen but references order",
            Phase = RulePhase.Validate,
            Assert = LeafCondition.Literal("order.product", OperatorKind.IsPresent),
            OnFailure = Outcome.Warning("order", "missing"),
            Scope = new RuleScope(Objects: new[] { "specimen" }, Properties: System.Array.Empty<string>()),
        };
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.IsValid.Should().BeTrue("LINT110 is a non-blocking Warning");
        report.Findings.Should().Contain(f => f.Severity == FindingSeverity.Warning && f.Code == "LINT110");
    }

    [Fact]
    public void Linter_CorrectlyScopedRule_ProducesNoLint110Warning()
    {
        // Scoped to "specimen" and references only specimen.age — no LINT110.
        var rule = new RuleDefinition
        {
            Key = "TEST-SCOPE-2",
            Name = "Correctly scoped to specimen",
            Phase = RulePhase.Validate,
            Assert = LeafCondition.Literal("specimen.age", OperatorKind.IsPresent),
            OnFailure = Outcome.Warning("order", "missing"),
            Scope = new RuleScope(Objects: new[] { "specimen" }, Properties: new[] { "specimen.age" }),
        };
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.Lint(rule);

        report.Findings.Should().NotContain(f => f.Code == "LINT110");
    }

    [Fact]
    public void Linter_LintJson_DeserializesThenLints_PM17_Clean()
    {
        var json = LoadRuleJson("PM17");
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.LintJson(json);

        report.IsValid.Should().BeTrue(
            $"PM17 JSON should be clean; findings: {string.Join("; ", report.Findings.Select(f => $"{f.Code}: {f.Message}"))}");
    }

    [Fact]
    public void Linter_LintJson_InvalidJson_ProducesError()
    {
        var linter = new VocabularyLinter(VocabularyCatalog.Default(), DiskReferenceData());

        var report = linter.LintJson("not json at all {{ broken");

        report.IsValid.Should().BeFalse();
        report.Findings.Should().NotBeEmpty();
        report.Findings.Should().Contain(f => f.Severity == FindingSeverity.Error);
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // SchemaValidator tests
    // ────────────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Schema_PM17Json_ValidatesClean()
    {
        var json = LoadRuleJson("PM17");
        var validator = new SchemaValidator();

        var errors = validator.Validate(json);

        errors.Should().BeEmpty($"PM17 JSON should conform to the schema; errors: {string.Join("; ", errors.Select(e => $"{e.Path}: {e.Message}"))}");
    }

    [Fact]
    public void Schema_MissingOnFailure_ProducesError()
    {
        // Valid otherwise but missing the required onFailure property.
        var json = """{"key":"X","name":"X","onSuccess":{"type":"Continue"}}""";
        var validator = new SchemaValidator();

        var errors = validator.Validate(json);

        errors.Should().NotBeEmpty("missing required 'onFailure' should produce schema errors");
    }

    [Fact]
    public void Schema_BadDiscriminator_ProducesError()
    {
        // "type": "banana" is not a valid condition discriminator.
        var json = """{"key":"X","name":"X","appliesWhen":{"type":"banana","subject":"x","operator":"Equals"},"onFailure":{"type":"Continue"}}""";
        var validator = new SchemaValidator();

        var errors = validator.Validate(json);

        errors.Should().NotBeEmpty("invalid condition 'type' discriminator should produce schema errors");
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // RoundTripParaphraser tests
    // ────────────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Paraphraser_PM17_ContainsKeyNouns()
    {
        var rule = LoadRule("PM17");
        var paraphraser = new RoundTripParaphraser();

        var text = paraphraser.Paraphrase(rule);

        text.Should().NotBeNullOrWhiteSpace();
        // Should mention the circledHE subject and the complete hold
        text.Should().MatchRegex("(?i)circledHE|circled|H&E|H\\u0026E");
        text.Should().MatchRegex("(?i)complete");
        text.Should().MatchRegex("(?i)hold");
    }

    [Fact]
    public void Paraphraser_PM48_ContainsArchive()
    {
        var rule = LoadRule("PM48");
        var paraphraser = new RoundTripParaphraser();

        var text = paraphraser.Paraphrase(rule);

        text.Should().NotBeNullOrWhiteSpace();
        text.Should().MatchRegex("(?i)archive");
        text.Should().MatchRegex("(?i)partial");
    }

    [Fact]
    public void Paraphraser_BL3_ContainsSetValue()
    {
        var rule = LoadRule("BL3");
        var paraphraser = new RoundTripParaphraser();

        var text = paraphraser.Paraphrase(rule);

        text.Should().NotBeNullOrWhiteSpace();
        text.Should().Contain("Pediatric");
        text.Should().MatchRegex("(?i)priority");
    }

    [Fact]
    public void Paraphraser_BL27_ContainsRecovery()
    {
        var rule = LoadRule("BL27");
        var paraphraser = new RoundTripParaphraser();

        var text = paraphraser.Paraphrase(rule);

        text.Should().NotBeNullOrWhiteSpace();
        text.Should().MatchRegex("(?i)default");
        text.Should().MatchRegex("(?i)gender");
    }

    [Fact]
    public void Paraphraser_BL46_ContainsPrevent()
    {
        var rule = LoadRule("BL46");
        var paraphraser = new RoundTripParaphraser();

        var text = paraphraser.Paraphrase(rule);

        text.Should().NotBeNullOrWhiteSpace();
        text.Should().MatchRegex("(?i)prevent");
        text.Should().MatchRegex("(?i)submit");
    }

    [Fact]
    public void Paraphraser_PM49_ContainsReview()
    {
        var rule = LoadRule("PM49");
        var paraphraser = new RoundTripParaphraser();

        var text = paraphraser.Paraphrase(rule);

        text.Should().NotBeNullOrWhiteSpace();
        text.Should().MatchRegex("(?i)review");
        text.Should().MatchRegex("(?i)fixation");
    }

    [Fact]
    public void Paraphraser_Deterministic()
    {
        var rule = LoadRule("PM17");
        var paraphraser = new RoundTripParaphraser();

        var first = paraphraser.Paraphrase(rule);
        var second = paraphraser.Paraphrase(rule);

        first.Should().Be(second, "paraphrase must be deterministic");
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // DryRunPreviewer tests
    // ────────────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task DryRun_PM17_FiresFixture_Applied_CompleteHold()
    {
        var rule = LoadRule("PM17");
        var refs = DiskReferenceData();
        var previewer = new DryRunPreviewer(refs);

        var firesFixture = LoadFixture("PM17_fires");
        var fixtures = new[] { ("PM17_fires", firesFixture) };

        var result = await previewer.PreviewAsync(rule, fixtures);

        result.Evaluated.Should().Be(1);
        var hit = result.Hits.Should().ContainSingle().Which;
        hit.Applied.Should().BeTrue("PM17_fires meets the appliesWhen condition");
        hit.Produced.Should().Be(OutcomeType.CompleteHold, "PM17_fires lacks circledHE so hold should fire");
    }

    [Fact]
    public async Task DryRun_PM17_CleanFixture_NotFired()
    {
        var rule = LoadRule("PM17");
        var refs = DiskReferenceData();
        var previewer = new DryRunPreviewer(refs);

        var cleanFixture = LoadFixture("PM17_clean");
        var fixtures = new[] { ("PM17_clean", cleanFixture) };

        var result = await previewer.PreviewAsync(rule, fixtures);

        result.Evaluated.Should().Be(1);
        var hit = result.Hits.Should().ContainSingle().Which;
        // Clean fixture has circledHE present — assertion passes — Continue outcome
        if (hit.Applied)
        {
            hit.Produced.Should().Be(OutcomeType.Continue, "clean fixture should produce Continue when assertion passes");
        }
        else
        {
            // Rule did not apply at all (AppliesWhen failed) — also acceptable
            hit.Applied.Should().BeFalse();
        }
    }

    [Fact]
    public async Task DryRun_NoSideEffects_CollectingHandlerNotCalledExternally()
    {
        var rule = LoadRule("PM17");
        var refs = DiskReferenceData();
        var previewer = new DryRunPreviewer(refs);

        var firesFixture = LoadFixture("PM17_fires");

        // Capture the JSON before the run to verify the original FactDocument is untouched.
        var originalJson = firesFixture.ToString();

        var fixtures = new[] { ("PM17_fires", firesFixture) };
        await previewer.PreviewAsync(rule, fixtures);

        // The original FactDocument should be unchanged (engine clones internally).
        firesFixture.ToString().Should().Be(originalJson,
            "the engine must clone the FactDocument; caller's facts must not be mutated");
    }
}
