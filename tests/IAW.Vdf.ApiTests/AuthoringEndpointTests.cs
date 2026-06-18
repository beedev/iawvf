using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace IAW.Vdf.ApiTests;

/// <summary>Authoring endpoint tests: vocabulary tree, lint, interpret (stub, scoped), paraphrase.</summary>
public sealed class AuthoringEndpointTests : IClassFixture<VdfApiFactory>
{
    private readonly VdfApiFactory _factory;

    public AuthoringEndpointTests(VdfApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Lint_WithUnknownSubject_ReturnsErrors()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var ruleJson = JsonDocument.Parse(SampleRules.InvalidUnknownSubject()).RootElement;
        var response = await client.PostAsJsonAsync("/api/authoring/lint", new { ruleJson });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("isValid").GetBoolean().Should().BeFalse();
        var errorCodes = root.GetProperty("findings")
            .EnumerateArray()
            .Where(f => f.GetProperty("severity").GetString() == "Error")
            .Select(f => f.GetProperty("code").GetString())
            .ToList();
        errorCodes.Should().Contain("LINT001"); // Unknown subject.
    }

    [Fact]
    public async Task Vocabulary_Authed_ReturnsObjectPropertyTree()
    {
        // Reviewer (non-author) is sufficient: the vocabulary endpoint allows any authenticated role.
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "reviewer", "reviewer-pw");

        var response = await client.GetAsync("/api/authoring/vocabulary");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var objects = root.GetProperty("objects").EnumerateArray().ToList();

        var order = objects.FirstOrDefault(o => o.GetProperty("name").GetString() == "order");
        order.ValueKind.Should().Be(JsonValueKind.Object);
        order.GetProperty("label").GetString().Should().Be("Order");
        var orderPropertyPaths = order.GetProperty("properties")
            .EnumerateArray()
            .Select(p => p.GetProperty("path").GetString())
            .ToList();
        orderPropertyPaths.Should().Contain("order.client.nyStatus");

        objects.Should().Contain(o => o.GetProperty("name").GetString() == "specimen");

        root.GetProperty("operators").EnumerateArray().Should().NotBeEmpty();
        root.GetProperty("outcomes").EnumerateArray().Should().NotBeEmpty();
    }

    [Fact]
    public async Task Vocabulary_Unauthenticated_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/authoring/vocabulary");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Interpret_WithFishCircledHePhrase_ReturnsCandidate()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var response = await client.PostAsJsonAsync("/api/authoring/interpret", new
        {
            naturalLanguage =
                "Require a circled H&E slide for a Technical FISH test on an FFPE specimen.",
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("confidence").GetDouble().Should().BeGreaterThan(0);
        root.TryGetProperty("candidate", out var candidate).Should().BeTrue();
        candidate.ValueKind.Should().Be(JsonValueKind.Object);
        candidate.GetProperty("key").GetString().Should().Be("PM17");
    }

    [Fact]
    public async Task Interpret_ScopedToObject_ReturnsOk()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var response = await client.PostAsJsonAsync("/api/authoring/interpret", new
        {
            naturalLanguage = "Hold the specimen when its type is incompatible.",
            objects = new[] { "specimen" },
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Interpret_WithUnknownProperty_Returns400()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var response = await client.PostAsJsonAsync("/api/authoring/interpret", new
        {
            naturalLanguage = "Some rule.",
            properties = new[] { "bogus.path" },
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("bogus.path");
    }

    [Fact]
    public async Task Paraphrase_Pm17_ReturnsNonEmptyText()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var ruleJson = JsonDocument.Parse(SampleRules.Pm17Json("PM17")).RootElement;
        var response = await client.PostAsJsonAsync("/api/authoring/paraphrase", new { ruleJson });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.GetProperty("paraphrase").GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Authoring_WithoutAuthorRole_Returns403()
    {
        // Reviewer lacks the Author policy.
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "reviewer", "reviewer-pw");

        var ruleJson = JsonDocument.Parse(SampleRules.Pm17Json("PM17")).RootElement;
        var response = await client.PostAsJsonAsync("/api/authoring/lint", new { ruleJson });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
