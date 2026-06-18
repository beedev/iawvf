using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace IAW.Vdf.ApiTests;

/// <summary>Evaluation endpoint tests: auth enforcement and a real PM17 firing against Postgres rules.</summary>
public sealed class EvaluationEndpointTests : IClassFixture<VdfApiFactory>
{
    private readonly VdfApiFactory _factory;

    public EvaluationEndpointTests(VdfApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Evaluate_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/evaluate", new
        {
            factsJson = new { test = new { code = "x" } },
        });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Evaluate_Pm17FiringFacts_ReturnsCompleteHoldWithTrace()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "lead", "lead-pw");

        // PM17 fires: Technical FISH (test.code in TechnicalFISH set) on FFPE, circled H&E absent.
        var facts = new
        {
            test = new { code = "FISH-T-001", specimen = new { type = "FFPE" }, orderedTest = "FISH-T-001" },
            specimen = new { type = "FFPE", age = 10, fixationTime = 24 },
            patient = new { age = 45, gender = "Male" },
            order = new { client = new { nyStatus = "Standard" }, performingLab = "Lab-NY-1" },
        };

        var response = await client.PostAsJsonAsync("/api/evaluate", new { factsJson = facts });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var outcomeTypes = root.GetProperty("outcomes")
            .EnumerateArray()
            .Select(o => o.GetProperty("type").GetString())
            .ToList();
        outcomeTypes.Should().Contain("CompleteHold");

        // The trace must be populated and include the PM17 rule.
        var ruleKeys = root.GetProperty("trace")
            .EnumerateArray()
            .Select(t => t.GetProperty("ruleKey").GetString())
            .ToList();
        ruleKeys.Should().NotBeEmpty();
        ruleKeys.Should().Contain("PM17");
    }

    [Fact]
    public async Task Evaluate_WithNonObjectFacts_Returns400ProblemDetails()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var response = await client.PostAsJsonAsync("/api/evaluate", new { factsJson = 42 });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.TryGetProperty("title", out _).Should().BeTrue();
        doc.RootElement.TryGetProperty("status", out var status).Should().BeTrue();
        status.GetInt32().Should().Be(400);
    }
}
