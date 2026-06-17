using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace IAW.Vdf.Persistence;

/// <summary>
/// Design-time factory used by <c>dotnet ef migrations</c> to create a <see cref="VdfDbContext"/>
/// without a running host. Reads the connection string from the <c>VDF_DB</c> environment variable,
/// falling back to the local dev default (Docker Postgres on port 5433).
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<VdfDbContext>
{
    private const string DevConnectionString =
        "Host=localhost;Port=5433;Database=iaw;Username=iaw;Password=iaw";

    /// <inheritdoc />
    public VdfDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("VDF_DB") ?? DevConnectionString;

        var optionsBuilder = new DbContextOptionsBuilder<VdfDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        return new VdfDbContext(optionsBuilder.Options);
    }
}
