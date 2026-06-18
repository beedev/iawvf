using FluentAssertions;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Persistence;
using IAW.Vdf.Persistence.Entities;
using IAW.Vdf.Persistence.Vocabulary;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IAW.Vdf.IntegrationTests;

/// <summary>
/// Integration tests for the governed, DB-backed vocabulary: the idempotent seeder, the refreshable
/// <see cref="DbVocabularyCatalogProvider"/>, and the deprecate-keeps-resolvable semantics. These run
/// against the live Postgres on port 5433 and clean up the rows they create.
/// </summary>
public sealed class VocabularyCatalogTests
{
    private static ServiceProvider BuildContainer()
    {
        var services = new ServiceCollection();
        services.AddDbContext<VdfDbContext>(o => o.UseNpgsql(TestDbContextFactory.ConnectionString));
        services.AddScoped<VocabularySeeder>();
        services.AddSingleton<IVocabularyCatalogProvider, DbVocabularyCatalogProvider>();
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task Seeder_PopulatesFromDefault_WhenEmpty_AndIsIdempotent()
    {
        await using var db = TestDbContextFactory.Create();
        var seeder = new VocabularySeeder(db);

        // Ensure the table is populated (no-op if a prior test/host already seeded it).
        await seeder.SeedIfEmptyAsync();

        var count = await db.VocabularySubjects.CountAsync();
        count.Should().BeGreaterThan(0, "the vocabulary should be seeded from Default()");

        var paths = await db.VocabularySubjects.Select(s => s.Path).ToListAsync();
        paths.Should().Contain("specimen.fixationTime");

        // Idempotency: a second seed inserts nothing.
        var insertedAgain = await seeder.SeedIfEmptyAsync();
        insertedAgain.Should().Be(0, "seeding is idempotent once the table is populated");

        // Derived metadata sanity: specimen.fixationTime → object "specimen", label "Specimen", Active.
        var fixation = await db.VocabularySubjects.FirstAsync(s => s.Path == "specimen.fixationTime");
        fixation.ObjectName.Should().Be("specimen");
        fixation.Label.Should().Be("Specimen");
        fixation.Status.Should().Be(VocabularySubjectStatus.Active);
        fixation.CreatedBy.Should().Be("system");
    }

    [Fact]
    public async Task Provider_Current_ContainsSeededSubjects_AndRefreshPicksUpNewSubject()
    {
        // Make sure the table is seeded first.
        await using (var seedDb = TestDbContextFactory.Create())
        {
            await new VocabularySeeder(seedDb).SeedIfEmptyAsync();
        }

        await using var container = BuildContainer();
        var provider = container.GetRequiredService<IVocabularyCatalogProvider>();
        await provider.RefreshAsync();

        provider.Current.IsKnownSubject("specimen.fixationTime").Should().BeTrue();
        // Closed grammar carried over from Default().
        provider.Current.Operators.Should().NotBeEmpty();
        provider.Current.Outcomes.Should().NotBeEmpty();
        provider.Current.References.Should().NotBeEmpty();

        var newPath = $"specimen.itVcat_{Guid.NewGuid():N}";
        try
        {
            // Not present until added.
            provider.Current.IsKnownSubject(newPath).Should().BeFalse();

            await using (var db = TestDbContextFactory.Create())
            {
                db.VocabularySubjects.Add(NewActive(newPath, "String"));
                await db.SaveChangesAsync();
            }

            // Stale cache still lacks it; refresh rebuilds.
            provider.Current.IsKnownSubject(newPath).Should().BeFalse();
            await provider.RefreshAsync();
            provider.Current.IsKnownSubject(newPath).Should().BeTrue();
        }
        finally
        {
            await DeleteSubjectAsync(newPath);
        }
    }

    [Fact]
    public async Task Deprecated_Subject_RemainsResolvable_InRuntimeCatalog()
    {
        await using (var seedDb = TestDbContextFactory.Create())
        {
            await new VocabularySeeder(seedDb).SeedIfEmptyAsync();
        }

        var path = $"specimen.itVdep_{Guid.NewGuid():N}";
        await using var container = BuildContainer();
        var provider = container.GetRequiredService<IVocabularyCatalogProvider>();

        try
        {
            await using (var db = TestDbContextFactory.Create())
            {
                db.VocabularySubjects.Add(NewActive(path, "Number"));
                await db.SaveChangesAsync();
            }

            await provider.RefreshAsync();
            provider.Current.IsKnownSubject(path).Should().BeTrue();

            // Deprecate it — it must STAY in the runtime catalog so live rules keep working.
            await using (var db = TestDbContextFactory.Create())
            {
                var entity = await db.VocabularySubjects.FirstAsync(s => s.Path == path);
                entity.Status = VocabularySubjectStatus.Deprecated;
                await db.SaveChangesAsync();
            }

            await provider.RefreshAsync();
            provider.Current.IsKnownSubject(path).Should().BeTrue(
                "deprecated subjects remain resolvable so live rules don't break");
        }
        finally
        {
            await DeleteSubjectAsync(path);
        }
    }

    private static VocabularySubjectEntity NewActive(string path, string dataType)
    {
        var now = DateTimeOffset.UtcNow;
        return new VocabularySubjectEntity
        {
            Id = Guid.NewGuid(),
            Path = path,
            ObjectName = VocabularyPathConventions.ObjectName(path),
            Label = VocabularyPathConventions.Humanize(VocabularyPathConventions.ObjectName(path)),
            DataType = dataType,
            Status = VocabularySubjectStatus.Active,
            Version = 1,
            EffectiveDate = now,
            CreatedBy = "integration-test",
            CreatedAt = now,
        };
    }

    private static async Task DeleteSubjectAsync(string path)
    {
        await using var db = TestDbContextFactory.Create();
        var entity = await db.VocabularySubjects.FirstOrDefaultAsync(s => s.Path == path);
        if (entity is not null)
        {
            db.VocabularySubjects.Remove(entity);
            await db.SaveChangesAsync();
        }
    }
}
