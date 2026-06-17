using FluentAssertions;
using IAW.Vdf.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace IAW.Vdf.IntegrationTests;

/// <summary>Verifies the database is reachable and migrations have been applied.</summary>
public sealed class DatabaseConnectivityTests
{
    [Fact]
    public async Task DbContext_Connects_And_MigrationsApplied()
    {
        // If the DB is unreachable this throws — the test fails clearly.
        await using var db = TestDbContextFactory.Create();

        // Verify we can connect.
        var canConnect = await db.Database.CanConnectAsync();
        canConnect.Should().BeTrue("Postgres should be running on port 5433");

        // Verify VdfInitial migration is in the history.
        var applied = await db.Database.GetAppliedMigrationsAsync();
        applied.Should().Contain(m => m.Contains("VdfInitial"),
            because: "the VdfInitial migration should have been applied");
    }

    [Fact]
    public async Task AllFourTables_Exist()
    {
        await using var db = TestDbContextFactory.Create();

        // Verify we can query all four tables without exception.
        var rulesCount = await db.Rules.CountAsync();
        var versionsCount = await db.RuleVersions.CountAsync();
        var refDataCount = await db.ReferenceData.CountAsync();
        var tracesCount = await db.DecisionTraces.CountAsync();

        // Just asserting queries don't throw (counts may be any non-negative value).
        rulesCount.Should().BeGreaterThanOrEqualTo(0);
        versionsCount.Should().BeGreaterThanOrEqualTo(0);
        refDataCount.Should().BeGreaterThanOrEqualTo(0);
        tracesCount.Should().BeGreaterThanOrEqualTo(0);
    }
}
