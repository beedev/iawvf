using System.Text.Json;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.Llm.Configuration;
using IAW.Vdf.Authoring.Llm.DependencyInjection;
using IAW.Vdf.Authoring.Llm.Interpretation;
using IAW.Vdf.Authoring.Llm.Prompting;
using IAW.Vdf.Core.ReferenceData;
using Microsoft.Extensions.DependencyInjection;

namespace IAW.Vdf.Tests;

/// <summary>
/// Offline, deterministic tests for the M4 LLM authoring layer: the stub interpreter, the validation gate
/// (the "no invention" enforcement point), the grounding prompt builder, and options/env binding. No test
/// here touches the network — the live OpenAI path is exercised only by the gated smoke test.
/// </summary>
public sealed class LlmInterpreterTests
{
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

    private static JsonReferenceDataProvider DiskReferenceData()
    {
        var rulesDir = FindDir("rules");
        return JsonReferenceDataProvider.FromFile(System.IO.Path.Combine(rulesDir, "reference-data.json"));
    }

    // ── StubRuleInterpreter ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Stub_CircledHE_FISH_ReturnsPm17Candidate_HighConfidence_NoGaps()
    {
        var stub = new StubRuleInterpreter();

        var result = await stub.InterpretAsync(
            "Hold the order if Technical FISH on FFPE has no circled H&E",
            VocabularyCatalog.Default());

        result.Candidate.Should().NotBeNull();
        result.Candidate!.Key.Should().Be("PM17");
        result.Candidate.OnFailure.Type.Should().Be(OutcomeType.CompleteHold);
        result.Confidence.Should().BeGreaterThan(0.8);
        result.Gaps.Should().BeEmpty();
    }

    [Fact]
    public async Task Stub_FollowUpInitialOrder_ReturnsBl46PreventAction()
    {
        var stub = new StubRuleInterpreter();

        var result = await stub.InterpretAsync(
            "When a follow-up order is placed but there is no qualifying initial order, prevent submission",
            VocabularyCatalog.Default());

        result.Candidate.Should().NotBeNull();
        result.Candidate!.Key.Should().Be("BL46");
        result.Candidate.OnFailure.Type.Should().Be(OutcomeType.PreventAction);
    }

    [Fact]
    public async Task Stub_Gibberish_ReturnsNullCandidate_WithGap()
    {
        var stub = new StubRuleInterpreter();

        var result = await stub.InterpretAsync("asdf qwer zxcv nonsense banana", VocabularyCatalog.Default());

        result.Candidate.Should().BeNull();
        result.Gaps.Should().NotBeEmpty();
        result.Confidence.Should().Be(0);
    }

    [Fact]
    public async Task Stub_IsDeterministic_SameInputSameOutput()
    {
        var stub = new StubRuleInterpreter();
        const string input = "Assign Pediatric priority for patients under 19";

        var first = await stub.InterpretAsync(input, VocabularyCatalog.Default());
        var second = await stub.InterpretAsync(input, VocabularyCatalog.Default());

        first.Candidate.Should().NotBeNull();
        first.Candidate!.Key.Should().Be(second.Candidate!.Key);
        first.Confidence.Should().Be(second.Confidence);
    }

    // ── Validation gate (no-network, canned model output) ────────────────────────────────────────────

    /// <summary>
    /// The gate must REJECT a model-proposed rule that references a subject outside the closed vocabulary
    /// ("specimen.colour"). This is the "no silent invention" enforcement: candidate suppressed, gap recorded.
    /// </summary>
    [Fact]
    public void Gate_UnknownSubject_RejectsCandidate_RecordsGap()
    {
        var gate = new RuleInterpretationGate(VocabularyCatalog.Default(), DiskReferenceData());

        const string rule = """
        {
          "key": "NL-BAD",
          "name": "Invented subject rule",
          "phase": "Validate",
          "assert": { "type": "leaf", "subject": "specimen.colour", "operator": "Equals", "value": "blue" },
          "onFailure": { "type": "CompleteHold", "scope": "order", "reason": "colour mismatch" }
        }
        """;
        var envelope = new ModelEnvelope
        {
            CandidateJson = rule,
            Confidence = 0.9,
        };

        var result = gate.Validate(envelope);

        result.Candidate.Should().BeNull("an unknown subject must not pass the gate");
        result.Gaps.Should().Contain(g => g.Contains("specimen.colour") || g.Contains("LINT001"));
        result.Confidence.Should().Be(0);
    }

    /// <summary>A clean, PM17-like model proposal must pass the gate and yield a valid candidate.</summary>
    [Fact]
    public void Gate_CleanCandidate_ReturnsValidRule()
    {
        var gate = new RuleInterpretationGate(VocabularyCatalog.Default(), DiskReferenceData());

        const string rule = """
        {
          "key": "NL1",
          "name": "Circled H&E for Technical FISH on FFPE",
          "phase": "Validate",
          "appliesWhen": {
            "type": "group",
            "logicalOp": "All",
            "conditions": [
              { "type": "leaf", "subject": "test.code", "operator": "InSet", "reference": "TechnicalFISH" },
              { "type": "leaf", "subject": "test.specimen.type", "operator": "Equals", "value": "FFPE" }
            ]
          },
          "assert": { "type": "leaf", "subject": "document.circledHE", "operator": "IsPresent" },
          "onSuccess": { "type": "Continue" },
          "onFailure": { "type": "CompleteHold", "scope": "order", "reason": "Circled H&E not present" }
        }
        """;
        var envelope = new ModelEnvelope
        {
            CandidateJson = rule,
            Confidence = 0.88,
        };

        var result = gate.Validate(envelope);

        result.Candidate.Should().NotBeNull("a clean, fully-grounded rule must pass the gate");
        result.Candidate!.Key.Should().Be("NL1");
        result.Candidate.OnFailure.Type.Should().Be(OutcomeType.CompleteHold);
        result.Confidence.Should().Be(0.88);
        result.Gaps.Should().BeEmpty();
    }

    /// <summary>An unknown reference key must also be rejected (LINT003).</summary>
    [Fact]
    public void Gate_UnknownReference_RejectsCandidate()
    {
        var gate = new RuleInterpretationGate(VocabularyCatalog.Default(), DiskReferenceData());

        const string rule = """
        {
          "key": "NL-REF",
          "name": "Invented reference rule",
          "phase": "Validate",
          "assert": { "type": "leaf", "subject": "order.performingLab", "operator": "IsEligibleFor", "reference": "TotallyMadeUpReference" },
          "onFailure": { "type": "ComplianceAlert", "scope": "order", "reason": "x" }
        }
        """;
        var result = gate.Validate(new ModelEnvelope { CandidateJson = rule, Confidence = 0.9 });

        result.Candidate.Should().BeNull();
        result.Gaps.Should().Contain(g => g.Contains("LINT003") || g.Contains("TotallyMadeUpReference"));
    }

    /// <summary>A schema-invalid proposal (bad outcome type) must be rejected with a gap.</summary>
    [Fact]
    public void Gate_SchemaInvalidCandidate_RejectsWithGap()
    {
        var gate = new RuleInterpretationGate(VocabularyCatalog.Default(), DiskReferenceData());

        const string rule = """
        {
          "key": "NL-SCHEMA",
          "name": "Bad outcome",
          "onFailure": { "type": "Teleport", "scope": "order" }
        }
        """;
        var result = gate.Validate(new ModelEnvelope { CandidateJson = rule, Confidence = 0.9 });

        result.Candidate.Should().BeNull();
        result.Gaps.Should().NotBeEmpty();
    }

    /// <summary>A null candidate (model declined) passes through the model's gaps and adds one if absent.</summary>
    [Fact]
    public void Gate_NullCandidate_PreservesGaps()
    {
        var gate = new RuleInterpretationGate(VocabularyCatalog.Default(), DiskReferenceData());

        var result = gate.Validate(new ModelEnvelope
        {
            CandidateJson = null,
            Confidence = 0.2,
            Gaps = new List<string> { "No subject models 'cold-ischemia time'." },
        });

        result.Candidate.Should().BeNull();
        result.Gaps.Should().ContainSingle().Which.Should().Contain("cold-ischemia");
    }

    // ── Grounding prompt ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Prompt_GroundsModelInCatalogTerms()
    {
        var catalog = VocabularyCatalog.Default();

        var system = RuleInterpretationPrompt.BuildSystemPrompt(catalog);

        // Subjects, operators, references, and outcomes must all appear so the model is constrained.
        system.Should().Contain("document.circledHE");
        system.Should().Contain("test.specimen.type");
        system.Should().Contain(nameof(OperatorKind.IsPresent));
        system.Should().Contain(nameof(OperatorKind.IsEligibleFor));
        system.Should().Contain("TechnicalFISH");
        system.Should().Contain(nameof(OutcomeType.CompleteHold));
        system.Should().Contain(nameof(OutcomeType.PreventAction));
        // The no-invention instruction must be present.
        system.Should().MatchRegex("(?i)no silent invention|grounding, not guessing");
    }

    [Fact]
    public void Prompt_IsDeterministicForSameCatalog()
    {
        var catalog = VocabularyCatalog.Default();

        var first = RuleInterpretationPrompt.BuildSystemPrompt(catalog);
        var second = RuleInterpretationPrompt.BuildSystemPrompt(catalog);

        first.Should().Be(second, "the grounding prompt must be deterministic");
    }

    // ── OpenAiOptions binding ────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Options_EnvironmentVariables_PopulateOptions()
    {
        var saved = SnapshotEnv("OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "OPENAI_ENABLED");
        try
        {
            Environment.SetEnvironmentVariable("OPENAI_API_KEY", "test-key-123");
            Environment.SetEnvironmentVariable("OPENAI_MODEL", "gpt-test");
            Environment.SetEnvironmentVariable("OPENAI_BASE_URL", "https://example.test/v1");
            Environment.SetEnvironmentVariable("OPENAI_ENABLED", "true");

            var options = OpenAiOptions.FromEnvironment();

            options.ApiKey.Should().Be("test-key-123");
            options.Model.Should().Be("gpt-test");
            options.BaseUrl.Should().Be("https://example.test/v1");
            options.Enabled.Should().BeTrue();
            options.CanCallLiveModel.Should().BeTrue();
            options.Temperature.Should().Be(0, "temperature defaults to 0 for determinism");
        }
        finally
        {
            RestoreEnv(saved);
        }
    }

    [Fact]
    public async Task OpenAi_MissingKey_ThrowsClearError_NoNetwork()
    {
        var options = new OpenAiOptions { Enabled = true, ApiKey = null };
        using var httpClient = new HttpClient();
        var interpreter = new OpenAiRuleInterpreter(httpClient, options, DiskReferenceData());

        var act = async () => await interpreter.InterpretAsync("anything", VocabularyCatalog.Default());

        (await act.Should().ThrowAsync<InvalidOperationException>())
            .Which.Message.Should().Contain("API key");
    }

    [Fact]
    public async Task OpenAi_Disabled_ThrowsClearError_NoNetwork()
    {
        var options = new OpenAiOptions { Enabled = false, ApiKey = "present" };
        using var httpClient = new HttpClient();
        var interpreter = new OpenAiRuleInterpreter(httpClient, options, DiskReferenceData());

        var act = async () => await interpreter.InterpretAsync("anything", VocabularyCatalog.Default());

        (await act.Should().ThrowAsync<InvalidOperationException>())
            .Which.Message.Should().Contain("disabled");
    }

    // ── DI ───────────────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Di_AddVdfStubInterpreter_ResolvesStub()
    {
        var services = new ServiceCollection();
        services.AddVdfStubInterpreter();
        using var provider = services.BuildServiceProvider();

        var interpreter = provider.GetRequiredService<Abstractions.Authoring.IRuleInterpreter>();

        interpreter.Should().BeOfType<StubRuleInterpreter>();
    }

    [Fact]
    public void Di_AddVdfLlmInterpreter_ResolvesOpenAiInterpreter()
    {
        var services = new ServiceCollection();
        services.AddSingleton<Abstractions.ReferenceData.IReferenceDataProvider>(DiskReferenceData());
        services.AddVdfLlmInterpreter(o =>
        {
            o.Enabled = true;
            o.ApiKey = "dummy";
        });
        using var provider = services.BuildServiceProvider();

        var interpreter = provider.GetRequiredService<Abstractions.Authoring.IRuleInterpreter>();

        interpreter.Should().BeOfType<OpenAiRuleInterpreter>();
    }

    [Fact]
    public void InterpreterVersion_IsStableConstant()
    {
        OpenAiRuleInterpreter.InterpreterVersion.Should().Be("openai-rule-interpreter/1.0.0");
        StubRuleInterpreter.InterpreterVersion.Should().Be("stub-rule-interpreter/1.0.0");
    }

    // ── Env helpers ──────────────────────────────────────────────────────────────────────────────────

    private static Dictionary<string, string?> SnapshotEnv(params string[] keys)
        => keys.ToDictionary(k => k, Environment.GetEnvironmentVariable);

    private static void RestoreEnv(Dictionary<string, string?> saved)
    {
        foreach (var (key, value) in saved)
            Environment.SetEnvironmentVariable(key, value);
    }
}
