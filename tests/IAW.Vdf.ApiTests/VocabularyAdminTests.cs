using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using IAW.Vdf.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace IAW.Vdf.ApiTests;

/// <summary>
/// Admin vocabulary endpoint tests: listing (incl. status), creating subjects (reflected in the authoring
/// tree), duplicate rejection, impact analysis against a corpus rule, deprecate-then-retire lifecycle, and
/// role enforcement. Runs against the live Postgres; created subjects are cleaned up.
/// </summary>
public sealed class VocabularyAdminTests : IClassFixture<VdfApiFactory>
{
    private readonly VdfApiFactory _factory;

    public VocabularyAdminTests(VdfApiFactory factory) => _factory = factory;

    [Fact]
    public async Task List_AsAdmin_ReturnsSubjectsWithStatus()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "admin", "admin-pw");

        var response = await client.GetAsync("/api/vocabulary");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var objects = doc.RootElement.GetProperty("objects").EnumerateArray().ToList();
        objects.Should().NotBeEmpty();

        var specimen = objects.First(o => o.GetProperty("name").GetString() == "specimen");
        var props = specimen.GetProperty("properties").EnumerateArray().ToList();
        props.Should().NotBeEmpty();
        // Every property carries a status.
        props.Should().OnlyContain(p => p.GetProperty("status").GetString() == "Active"
                                        || p.GetProperty("status").GetString() == "Deprecated");
    }

    [Fact]
    public async Task Create_NewSubject_Returns201_AndAppearsInAuthoringTree()
    {
        const string path = "specimen.colour";
        await DeleteSubjectAsync(path);

        var admin = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "admin", "admin-pw");

        try
        {
            var create = await admin.PostAsJsonAsync("/api/vocabulary",
                new { path, dataType = "String" });
            create.StatusCode.Should().Be(HttpStatusCode.Created);

            // The live, DB-backed catalog must now expose it via the authoring tree (active-only).
            var authorClient = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");
            var tree = await authorClient.GetAsync("/api/authoring/vocabulary");
            tree.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await tree.Content.ReadAsStringAsync());
            var specimen = doc.RootElement.GetProperty("objects").EnumerateArray()
                .First(o => o.GetProperty("name").GetString() == "specimen");
            var paths = specimen.GetProperty("properties").EnumerateArray()
                .Select(p => p.GetProperty("path").GetString())
                .ToList();
            paths.Should().Contain(path);
        }
        finally
        {
            await DeleteSubjectAsync(path);
        }
    }

    [Fact]
    public async Task Create_DuplicatePath_Returns409()
    {
        // specimen.age is seeded by default.
        var admin = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "admin", "admin-pw");

        var response = await admin.PostAsJsonAsync("/api/vocabulary",
            new { path = "specimen.age", dataType = "Number" });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Impact_ForSubjectUsedByCorpusRule_ReturnsReferencingRules()
    {
        // PM48 references specimen.age (and specimen.archiveRetrievalDate).
        var admin = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "admin", "admin-pw");

        var response = await admin.GetAsync("/api/vocabulary/specimen.age/impact?path=specimen.age");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var rules = doc.RootElement.GetProperty("referencingRules").EnumerateArray()
            .Select(r => r.GetProperty("key").GetString())
            .ToList();
        rules.Should().NotBeEmpty();
        rules.Should().Contain("PM48");
        doc.RootElement.GetProperty("count").GetInt32().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Delete_ActiveInUseSubject_Returns409()
    {
        // specimen.age is Active AND referenced by PM48 — retirement must be refused.
        var admin = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "admin", "admin-pw");

        var response = await admin.DeleteAsync("/api/vocabulary/specimen.age?path=specimen.age");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task DeprecateThenDelete_UnusedSubject_Succeeds()
    {
        const string path = "specimen.itRetire";
        await DeleteSubjectAsync(path);

        var admin = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "admin", "admin-pw");

        try
        {
            // Create an Active subject no rule references.
            var create = await admin.PostAsJsonAsync("/api/vocabulary",
                new { path, dataType = "String" });
            create.StatusCode.Should().Be(HttpStatusCode.Created);

            // Cannot delete while Active.
            var deleteActive = await admin.DeleteAsync($"/api/vocabulary/{path}?path={path}");
            deleteActive.StatusCode.Should().Be(HttpStatusCode.Conflict);

            // Deprecate it.
            var deprecate = await admin.PostAsync($"/api/vocabulary/{path}/deprecate?path={path}", content: null);
            deprecate.StatusCode.Should().Be(HttpStatusCode.OK);

            // Now retirement succeeds (deprecated + unreferenced).
            var delete = await admin.DeleteAsync($"/api/vocabulary/{path}?path={path}");
            delete.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Confirm gone.
            await using var db = _factory.CreateDbContext();
            (await db.VocabularySubjects.AnyAsync(s => s.Path == path)).Should().BeFalse();
        }
        finally
        {
            await DeleteSubjectAsync(path);
        }
    }

    [Fact]
    public async Task Vocabulary_AsNonAdmin_Returns403()
    {
        var author = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var response = await author.GetAsync("/api/vocabulary");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private async Task DeleteSubjectAsync(string path)
    {
        await using var db = _factory.CreateDbContext();
        var entity = await db.VocabularySubjects.FirstOrDefaultAsync(s => s.Path == path);
        if (entity is not null)
        {
            db.VocabularySubjects.Remove(entity);
            await db.SaveChangesAsync();
        }
    }
}
