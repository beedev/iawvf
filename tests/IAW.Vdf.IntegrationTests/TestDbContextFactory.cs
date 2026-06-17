using IAW.Vdf.Persistence;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.IntegrationTests;

/// <summary>
/// Creates a fresh <see cref="VdfDbContext"/> for each integration test, pointing at the local
/// Docker Postgres on port 5433. Each test class that uses this helper is responsible for
/// database cleanup (use a unique schema or truncate tables between tests).
/// </summary>
internal static class TestDbContextFactory
{
    public const string ConnectionString =
        "Host=localhost;Port=5433;Database=iaw;Username=iaw;Password=iaw";

    public static VdfDbContext Create()
    {
        var options = new DbContextOptionsBuilder<VdfDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;

        return new VdfDbContext(options);
    }
}
