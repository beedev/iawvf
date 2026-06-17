using FluentAssertions;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.Time;
using IAW.Vdf.Persistence.Repositories;
using IAW.Vdf.Persistence.Seeding;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace IAW.Vdf.IntegrationTests;

/// <summary>
/// End-to-end integration tests that wire up the M0 VdfEngine against
/// EfRuleRepository + EfReferenceDataProvider (both backed by Postgres).
/// </summary>
public sealed class EngineEndToEndTests : IAsyncDisposable
{
    // Absolute path to the rules corpus in the repo. Walk up from the test assembly
    // until we find the directory that contains the "rules" folder (robust to bin depth).
    private static readonly string RulesDir = ResolveRulesDir();

    private static string ResolveRulesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "rules");
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "reference-data.json")))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate the 'rules' corpus directory above " + AppContext.BaseDirectory);
    }

    private static readonly string ReferenceDataPath =
        Path.Combine(RulesDir, "reference-data.json");

    private readonly IAW.Vdf.Persistence.VdfDbContext _db;
    private readonly EfRuleRepository _ruleRepo;
    private readonly EfReferenceDataProvider _refDataProvider;

    public EngineEndToEndTests()
    {
        _db = TestDbContextFactory.Create();
        _ruleRepo = new EfRuleRepository(_db);
        _refDataProvider = new EfReferenceDataProvider(_db);
    }

    [Fact]
    public async Task ImportCorpus_Then_Engine_PM17_Fires_CompleteHold()
    {
        // 1. Import rules corpus and reference data into Postgres.
        var importer = new RulesCorpusImporter(_ruleRepo, _db);
        await importer.ImportAsync(RulesDir, ReferenceDataPath);

        // 2. Wire engine with Postgres-backed repository and reference data provider.
        var selector = new RuleSelector();
        var engine = new VdfEngine(_ruleRepo, _refDataProvider, selector, new SystemClock());

        // 3. Build a fact document that satisfies PM17's AppliesWhen
        //    (test.code InSet TechnicalFISH, test.specimen.type == "FFPE")
        //    but fails PM17's Assert (document.circledHE IsPresent → absent = fail → CompleteHold).
        var facts = FactDocument.Parse("""
            {
              "test": {
                "code": "FISH-T-001",
                "specimen": { "type": "FFPE" }
              },
              "document": {}
            }
            """);

        var request = new EvaluationRequest
        {
            Trigger = Trigger.OrderEvent("OrderReceived"),
            Facts = facts,
            AsOf = DateTimeOffset.UtcNow,
        };

        // 4. Evaluate.
        var result = await engine.EvaluateAsync(request);

        // 5. Assert PM17 fired a CompleteHold on "order".
        result.Outcomes.Should().Contain(o =>
            o.Type == OutcomeType.CompleteHold && o.Scope == "order",
            because: "PM17 should fire CompleteHold when circledHE is absent for Technical FISH on FFPE");

        // 6. Verify the trace includes PM17.
        result.Trace.Should().Contain(t => t.RuleKey == "PM17" && t.Applied,
            because: "PM17 trace should show the rule applied");
    }

    [Fact]
    public async Task ReferenceDataProvider_ResolvesNestedDottedKey()
    {
        // Ensure reference data is imported.
        var importer = new RulesCorpusImporter(_ruleRepo, _db);
        await importer.ImportAsync(RulesDir, ReferenceDataPath);

        // PolicyThresholds.archiveAgeDays should resolve to 30.
        var value = _refDataProvider.Resolve("PolicyThresholds.archiveAgeDays");
        value.Should().NotBeNull();
        value!.GetValue<int>().Should().Be(30);
    }

    [Fact]
    public async Task ReferenceDataProvider_ResolvesTopLevelArrayKey()
    {
        var importer = new RulesCorpusImporter(_ruleRepo, _db);
        await importer.ImportAsync(RulesDir, ReferenceDataPath);

        // TechnicalFISH is a top-level array.
        var value = _refDataProvider.Resolve("TechnicalFISH");
        value.Should().NotBeNull();
        value!.AsArray().Should().HaveCountGreaterThan(0);
    }

    public async ValueTask DisposeAsync()
    {
        await _db.DisposeAsync();
    }
}
