using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.Llm.Configuration;
using IAW.Vdf.Authoring.Llm.Interpretation;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Serialization;
using Xunit.Abstractions;

namespace IAW.Vdf.Tests;

/// <summary>
/// A GATED, manual live smoke test for the real OpenAI interpreter. It is skipped by default so the
/// automated suite stays fully offline and deterministic — even when a <c>.env</c> file is present at the
/// repo root. The test only runs when the explicit opt-in flag <c>IAW_RUN_LIVE_SMOKE=true</c> is set; the
/// normal CI/test run never sets it, so no network call happens. When the flag is set the test loads
/// <c>&lt;repoRoot&gt;/.env</c>, calls the real model once, and prints the structured rule, confidence, and
/// gaps. To run it manually:
/// <code>IAW_RUN_LIVE_SMOKE=true dotnet test --filter LiveOpenAiSmokeTest --logger "console;verbosity=detailed"</code>
/// </summary>
public sealed class LiveOpenAiSmokeTest
{
    private readonly ITestOutputHelper _output;

    /// <summary>Creates the smoke test with the xUnit output sink.</summary>
    /// <param name="output">The test output helper.</param>
    public LiveOpenAiSmokeTest(ITestOutputHelper output) => _output = output;

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

    [SkippableFact]
    public async Task LiveInterpret_FollowUpRule_PrintsStructuredRule()
    {
        // Explicit opt-in gate. The automated suite never sets IAW_RUN_LIVE_SMOKE, so this test is skipped
        // (no network) even when a repo-root .env with a real key is present. Only a deliberate manual run
        // (IAW_RUN_LIVE_SMOKE=true) proceeds to load .env and call the real model.
        var optIn = Environment.GetEnvironmentVariable("IAW_RUN_LIVE_SMOKE");
        Skip.IfNot(string.Equals(optIn, "true", StringComparison.OrdinalIgnoreCase),
            "Live OpenAI smoke test skipped: set IAW_RUN_LIVE_SMOKE=true to run it (also requires OPENAI_ENABLED and OPENAI_API_KEY via env or repo-root .env).");

        // Load .env from the repo root if present (does not override real env vars).
        DotEnv.LoadFromAncestors(AppContext.BaseDirectory);

        var options = OpenAiOptions.FromEnvironment();
        Skip.IfNot(options.CanCallLiveModel,
            "Live OpenAI smoke test skipped: OPENAI_ENABLED=true and OPENAI_API_KEY are required (via env or repo-root .env).");

        var references = JsonReferenceDataProvider.FromFile(
            System.IO.Path.Combine(FindDir("rules"), "reference-data.json"));

        using var httpClient = new HttpClient();
        var interpreter = new OpenAiRuleInterpreter(httpClient, options, references);

        const string nl = "When a follow-up order is placed but the patient has no qualifying initial order, prevent submission.";
        _output.WriteLine($"NL input: {nl}");
        _output.WriteLine($"Model: {options.Model}  Interpreter: {OpenAiRuleInterpreter.InterpreterVersion}");

        var result = await interpreter.InterpretAsync(nl, VocabularyCatalog.Default());

        _output.WriteLine($"Confidence: {result.Confidence}");
        _output.WriteLine($"UnmappedPhrases: [{string.Join(", ", result.UnmappedPhrases)}]");
        _output.WriteLine($"Gaps: [{string.Join(" | ", result.Gaps)}]");
        if (result.Candidate is not null)
        {
            _output.WriteLine("Candidate rule:");
            _output.WriteLine(RuleSerializer.Serialize(result.Candidate));
        }
        else
        {
            _output.WriteLine("Candidate: <null>");
        }
    }
}
