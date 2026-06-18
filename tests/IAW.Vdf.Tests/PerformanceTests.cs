using System.Diagnostics;
using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Core.Time;
using Xunit;
using Xunit.Abstractions;

namespace IAW.Vdf.Tests;

/// <summary>
/// Engine performance sanity (G-series SLA). Builds a rule set of 100+ rules — synthesized from the real
/// corpus by replicating each rule under distinct keys — and asserts a single evaluation of a fact
/// document against ALL of them completes well within the SLA on this machine.
/// <para>
/// The measurement uses a WARM run (a JIT warm-up evaluation is discarded first) and the deterministic
/// <see cref="FixedClock"/> so the result is stable and not flaky. The asserted ceiling (200 ms) carries
/// a generous margin over the observed warm time.
/// </para>
/// </summary>
public sealed class PerformanceTests
{
    private const int SlaMilliseconds = 200;
    private const int MinimumRuleCount = 100;

    private static readonly string RulesDir = FindDir("rules");
    private static readonly string ReferenceDataPath = Path.Combine(RulesDir, "reference-data.json");
    private static readonly DateTimeOffset FixedNow = new(2026, 6, 17, 12, 0, 0, TimeSpan.Zero);

    private readonly ITestOutputHelper _output;

    public PerformanceTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public async Task Engine_evaluates_100_plus_rules_within_SLA()
    {
        // ── Arrange: synthesize a 100+ rule set from the corpus under distinct keys ──────────────────
        var rules = BuildLargeRuleSet(MinimumRuleCount);
        rules.Length.Should().BeGreaterOrEqualTo(MinimumRuleCount,
            $"the performance set must contain at least {MinimumRuleCount} rules");

        var engine = new VdfEngine(
            new InMemoryRuleRepository(rules),
            JsonReferenceDataProvider.FromFile(ReferenceDataPath),
            new RuleSelector(),
            new FixedClock(FixedNow));

        var facts = WellFormedOrderFacts();
        var request = new EvaluationRequest
        {
            Trigger = Trigger.OrderEvent("PerfTest"),
            Facts = facts,
            AsOf = FixedNow,
        };

        // ── Warm-up: discard the first (JIT) run so the measurement reflects steady state ────────────
        var warmUp = await engine.EvaluateAsync(request);
        warmUp.Trace.Should().HaveCountGreaterOrEqualTo(MinimumRuleCount,
            "every rule in the set should be evaluated and traced");

        // ── Act: time a single warm evaluation over all 100+ rules ───────────────────────────────────
        var sw = Stopwatch.StartNew();
        var result = await engine.EvaluateAsync(request);
        sw.Stop();

        var elapsedMs = sw.Elapsed.TotalMilliseconds;
        _output.WriteLine(
            $"Evaluated {rules.Length} rules in {elapsedMs:F2} ms (SLA < {SlaMilliseconds} ms).");

        // ── Assert: correctness (all traced) + within SLA ───────────────────────────────────────────
        result.Trace.Should().HaveCountGreaterOrEqualTo(MinimumRuleCount);
        elapsedMs.Should().BeLessThan(
            SlaMilliseconds,
            $"a single evaluation over {rules.Length} rules should complete within the {SlaMilliseconds} ms SLA");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Builds at least <paramref name="minimum"/> rules by replicating every corpus rule file under a
    /// unique key (e.g. BL8, BL8__perf2, BL8__perf3, …). Each variant is a real, fully-formed corpus rule
    /// loaded through the production serializer — only its key (and name) is rewritten to keep keys unique.
    /// </summary>
    private static RuleDefinition[] BuildLargeRuleSet(int minimum)
    {
        var ruleFiles = Directory
            .EnumerateFiles(RulesDir, "*.json")
            .Where(f => !Path.GetFileName(f).Equals("reference-data.json", StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f, StringComparer.Ordinal)
            .ToArray();

        var rules = new List<RuleDefinition>();
        var copy = 1;
        while (rules.Count < minimum)
        {
            foreach (var file in ruleFiles)
            {
                var node = JsonNode.Parse(File.ReadAllText(file))!.AsObject();
                if (copy > 1)
                {
                    var baseKey = node["key"]!.GetValue<string>();
                    node["key"] = $"{baseKey}__perf{copy}";
                    if (node["name"] is not null)
                    {
                        node["name"] = $"{node["name"]!.GetValue<string>()} (perf variant {copy})";
                    }
                }

                rules.Add(RuleSerializer.Deserialize(node.ToJsonString()));
            }

            copy++;
        }

        return rules.ToArray();
    }

    /// <summary>
    /// A single well-formed order that satisfies the corpus rules' <c>appliesWhen</c> predicates broadly,
    /// so the engine performs real select + evaluate work across the full set rather than short-circuiting.
    /// </summary>
    private static FactDocument WellFormedOrderFacts() => FactDocument.Parse("""
        {
          "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" }, "orderedTest": "FISH-T-001", "capGoverned": true },
          "document": { "circledHE": "slide-HE-001" },
          "specimen": { "type": "FFPE", "age": 5, "fixationTime": 24, "bodySite": "Lymph Node" },
          "patient": { "age": 45, "gender": "Male" },
          "incident": { "id": "INC-001", "ageHours": 12 },
          "medicalReview": { "decision": "Approve" },
          "priorTimepoint": { "status": "Complete" },
          "order": {
            "id": "ORD-001",
            "type": "Initial",
            "client": { "nyStatus": "NYRegulated" },
            "performingLab": "Lab-NY-1",
            "product": "RaDaR",
            "timepoint": "First",
            "specimens": [ { "type": "FFPE" }, { "type": "PeripheralBlood" } ]
          }
        }
        """);

    private static string FindDir(string name)
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            var candidate = Path.Combine(dir, name);
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = Directory.GetParent(dir)?.FullName;
        }

        var abs = $"/Users/bharath/Desktop/NeoGenomics/IAW/{name}";
        if (Directory.Exists(abs))
        {
            return abs;
        }

        throw new DirectoryNotFoundException(
            $"Could not locate '{name}' directory — run from the repo root or ensure the build output path is correct.");
    }
}
