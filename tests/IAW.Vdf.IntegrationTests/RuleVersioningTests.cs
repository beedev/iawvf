using FluentAssertions;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace IAW.Vdf.IntegrationTests;

/// <summary>
/// Tests for rule round-tripping, versioning, and effective-dating via EfRuleRepository.
/// Each test uses a unique rule key suffix to avoid cross-test interference without needing
/// full table truncation.
/// </summary>
public sealed class RuleVersioningTests : IAsyncDisposable
{
    private readonly IAW.Vdf.Persistence.VdfDbContext _db;
    private readonly EfRuleRepository _repo;
    private readonly List<string> _usedKeys = new();

    public RuleVersioningTests()
    {
        _db = TestDbContextFactory.Create();
        _repo = new EfRuleRepository(_db);
    }

    // --- Test 1: Save → round-trip GetByKey ---

    [Fact]
    public async Task SaveAsync_Creates_RuleEntity_And_RuleVersion_V1_RoundTrips()
    {
        var key = UniqueKey("PM48");
        var rule = MakePm48(key, version: 1, effectiveDate: DateTimeOffset.MinValue);

        await _repo.SaveAsync(rule);

        // Verify entity row.
        var ruleEntity = await _db.Rules.FirstOrDefaultAsync(r => r.RuleKey == key);
        ruleEntity.Should().NotBeNull();
        ruleEntity!.Name.Should().Be(rule.Name);

        // Verify version row.
        var versionEntity = await _db.RuleVersions.FirstOrDefaultAsync(v => v.RuleId == ruleEntity.Id);
        versionEntity.Should().NotBeNull();
        versionEntity!.Version.Should().Be(1);
        versionEntity.IsActive.Should().BeTrue();

        // Round-trip deserialization.
        var loaded = await _repo.GetByKeyAsync(key);
        loaded.Should().NotBeNull();
        loaded!.Key.Should().Be(rule.Key);
        loaded.Name.Should().Be(rule.Name);
        loaded.Priority.Should().Be(rule.Priority);
        loaded.Phase.Should().Be(rule.Phase);
        loaded.Enabled.Should().Be(rule.Enabled);
        loaded.OnFailure.Type.Should().Be(OutcomeType.PartialHold);
    }

    // --- Test 2: Second SaveAsync creates V2, deactivates V1 ---

    [Fact]
    public async Task SaveAsync_Second_Call_Creates_V2_And_Deactivates_V1()
    {
        var key = UniqueKey("PM48-v2");
        var v1 = MakePm48(key, version: 1, effectiveDate: DateTimeOffset.MinValue);
        await _repo.SaveAsync(v1);

        // Update: change priority and save again.
        var v2Rule = new RuleDefinition
        {
            Key = key,
            Name = v1.Name + " (updated)",
            Priority = 99,
            Phase = v1.Phase,
            Enabled = v1.Enabled,
            EffectiveDate = DateTimeOffset.MinValue,
            AppliesWhen = v1.AppliesWhen,
            Assert = v1.Assert,
            OnSuccess = v1.OnSuccess,
            OnFailure = v1.OnFailure,
        };
        await _repo.SaveAsync(v2Rule);

        var ruleEntity = await _db.Rules
            .Include(r => r.Versions)
            .FirstAsync(r => r.RuleKey == key);

        ruleEntity.Versions.Should().HaveCount(2, "two versions should exist");

        var sortedVersions = ruleEntity.Versions.OrderBy(v => v.Version).ToList();
        sortedVersions[0].Version.Should().Be(1);
        sortedVersions[0].IsActive.Should().BeFalse("V1 should be deactivated when V2 is saved");
        sortedVersions[1].Version.Should().Be(2);
        sortedVersions[1].IsActive.Should().BeTrue("V2 should be the active version");

        // GetByKey should return V2.
        var loaded = await _repo.GetByKeyAsync(key);
        loaded!.Version.Should().Be(2);
        loaded.Priority.Should().Be(99);
    }

    // --- Test 3: Effective-dating ---

    [Fact]
    public async Task GetActiveRulesAsync_FutureEffectiveDate_NotReturnedForNow_ButReturnedForFuture()
    {
        var key = UniqueKey("PM48-future");
        var futureDate = DateTimeOffset.UtcNow.AddDays(30);

        // Save a version with a future effective date.
        var futureRule = new RuleDefinition
        {
            Key = key,
            Name = "Future Rule",
            Phase = RulePhase.Validate,
            Enabled = true,
            EffectiveDate = futureDate,
            OnFailure = Outcome.PartialHold("test", "future test"),
        };
        await _repo.SaveAsync(futureRule);

        // Query as of now: the future rule should NOT appear.
        var now = DateTimeOffset.UtcNow;
        var activeNow = await _repo.GetActiveRulesAsync(now);
        activeNow.Should().NotContain(r => r.Key == key,
            because: "the rule's effective date is in the future");

        // Query as of the future date: it SHOULD appear.
        var activeFuture = await _repo.GetActiveRulesAsync(futureDate.AddMinutes(1));
        activeFuture.Should().Contain(r => r.Key == key,
            because: "the rule should be active after its effective date");
    }

    // --- Test 4: Versioning with effective-dating (V2 is future, V1 remains active for now) ---

    [Fact]
    public async Task GetActiveRulesAsync_WhenV2IsFutureEffective_ReturnsV1ForNow_V2ForFuture()
    {
        var key = UniqueKey("PM48-eff");
        var futureDate = DateTimeOffset.UtcNow.AddDays(7);

        // Save V1 with immediate effective date.
        var v1 = MakePm48(key, version: 1, effectiveDate: DateTimeOffset.MinValue);
        await _repo.SaveAsync(v1);

        // Save V2 with future effective date. V1 should remain active for queries with asOf=now.
        // When asOf=futureDate, V2 should be returned.
        var v2 = new RuleDefinition
        {
            Key = key,
            Name = v1.Name + " (v2 future)",
            Priority = v1.Priority,
            Phase = v1.Phase,
            Enabled = v1.Enabled,
            EffectiveDate = futureDate,
            AppliesWhen = v1.AppliesWhen,
            Assert = v1.Assert,
            OnSuccess = v1.OnSuccess,
            OnFailure = v1.OnFailure,
        };
        await _repo.SaveAsync(v2);

        // asOf = now: should get V1 (the currently active version)
        var now = DateTimeOffset.UtcNow;
        var activeNow = await _repo.GetActiveRulesAsync(now);
        var ruleNow = activeNow.FirstOrDefault(r => r.Key == key);
        ruleNow.Should().NotBeNull("V1 should be active for asOf=now");
        ruleNow!.Version.Should().Be(1);

        // asOf = futureDate + 1 min: should get V2
        var activeFuture = await _repo.GetActiveRulesAsync(futureDate.AddMinutes(1));
        var ruleFuture = activeFuture.FirstOrDefault(r => r.Key == key);
        ruleFuture.Should().NotBeNull("V2 should be active for asOf=future");
        ruleFuture!.Version.Should().Be(2);
    }

    // --- Test 4b: Authored scope persists across save/get ---

    [Fact]
    public async Task SaveAsync_WithRuleScope_GetByKey_PreservesObjectsAndProperties()
    {
        var key = UniqueKey("PM48-scope");
        var rule = new RuleDefinition
        {
            Key = key,
            Name = "Scoped rule for persistence",
            Priority = 20,
            Phase = RulePhase.Validate,
            Enabled = true,
            EffectiveDate = DateTimeOffset.MinValue,
            Assert = new LeafCondition
            {
                Subject = "specimen.archiveRetrievalDate",
                Operator = OperatorKind.IsPresent,
            },
            OnFailure = Outcome.PartialHold("test", "missing"),
            Scope = new RuleScope(
                Objects: new[] { "specimen" },
                Properties: new[] { "specimen.age", "specimen.archiveRetrievalDate" }),
        };

        await _repo.SaveAsync(rule);

        var loaded = await _repo.GetByKeyAsync(key);
        loaded.Should().NotBeNull();
        loaded!.Scope.Should().NotBeNull("the authored scope must ride along in DefinitionJson");
        loaded.Scope!.Objects.Should().Equal("specimen");
        loaded.Scope.Properties.Should().Equal("specimen.age", "specimen.archiveRetrievalDate");
    }

    // --- Test 4c: Backward compatibility — a scopeless rule loads with Scope == null ---

    [Fact]
    public async Task SaveAsync_WithoutScope_GetByKey_ReturnsNullScope()
    {
        var key = UniqueKey("PM48-noscope");
        var rule = MakePm48(key, version: 1, effectiveDate: DateTimeOffset.MinValue);
        rule.Scope.Should().BeNull();

        await _repo.SaveAsync(rule);

        var loaded = await _repo.GetByKeyAsync(key);
        loaded.Should().NotBeNull();
        loaded!.Scope.Should().BeNull();
    }

    // --- Test 5: SQL injection safety (ruleSet with special chars) ---

    [Fact]
    public async Task GetActiveRulesAsync_RuleSetWithQuoteCharacter_DoesNotThrow()
    {
        // If queries were string-concatenated this would break. EF parameters prevent that.
        var action = async () =>
        {
            await _repo.GetActiveRulesAsync(DateTimeOffset.UtcNow, ruleSet: "test'; DROP TABLE rules; --");
        };

        await action.Should().NotThrowAsync(
            because: "EF Core uses parameterized queries — injection attempts should be harmless");
    }

    // --- Helpers ---

    private string UniqueKey(string prefix) =>
        $"{prefix}-{Guid.NewGuid():N}";

    private static RuleDefinition MakePm48(string key, int version, DateTimeOffset effectiveDate) =>
        new()
        {
            Key = key,
            Name = "Archive retrieval date required for aged specimens",
            Description = "Test rule for integration tests",
            Priority = 20,
            Phase = RulePhase.Validate,
            Enabled = true,
            Version = version,
            EffectiveDate = effectiveDate,
            AppliesWhen = new LeafCondition
            {
                Subject = "specimen.age",
                Operator = OperatorKind.GreaterThan,
                Reference = "PolicyThresholds.archiveAgeDays",
            },
            Assert = new LeafCondition
            {
                Subject = "specimen.archiveRetrievalDate",
                Operator = OperatorKind.IsPresent,
            },
            OnSuccess = Outcome.Continue(),
            OnFailure = Outcome.PartialHold("test", "Archive retrieval date missing for specimen older than threshold"),
        };

    public async ValueTask DisposeAsync()
    {
        await _db.DisposeAsync();
    }
}
