using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace IAW.Vdf.ApiTests;

/// <summary>
/// Governance flow tests for <c>RulesController</c>: create (Author) → get → approve (Reviewer),
/// role enforcement (Author cannot approve), and the lint-error rejection (422). Created rules are
/// removed in teardown so the suite is repeatable against the shared Postgres.
/// </summary>
public sealed class RulesGovernanceTests : IClassFixture<VdfApiFactory>, IAsyncLifetime
{
    private const string TestKey = "API_TEST_PM17";
    private const string LintRejectKey = "API_TEST_LINTREJECT";

    private readonly VdfApiFactory _factory;

    public RulesGovernanceTests(VdfApiFactory factory) => _factory = factory;

    public Task InitializeAsync() => CleanupAsync();

    public Task DisposeAsync() => CleanupAsync();

    private async Task CleanupAsync()
    {
        await ApiTestHelpers.DeleteRuleAsync(_factory, TestKey);
        await ApiTestHelpers.DeleteRuleAsync(_factory, LintRejectKey);
    }

    [Fact]
    public async Task CreateGetApprove_Flow_Succeeds()
    {
        var authorClient = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        // Create (Author).
        var ruleJson = JsonDocument.Parse(SampleRules.Pm17Json(TestKey)).RootElement;
        var createResponse = await authorClient.PostAsJsonAsync("/api/rules", new
        {
            ruleJson,
            authorNl = "Require a circled H&E slide for Technical FISH on FFPE.",
            interpreterVersion = "stub-rule-interpreter/1.0.0",
        });

        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        // Get it back (any authenticated role).
        var getResponse = await authorClient.GetAsync($"/api/rules/{TestKey}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var getJson = await getResponse.Content.ReadAsStringAsync();
        using (var doc = JsonDocument.Parse(getJson))
        {
            doc.RootElement.GetProperty("summary").GetProperty("key").GetString().Should().Be(TestKey);
            // Provenance round-tripped.
            doc.RootElement.GetProperty("interpreterVersion").GetString()
                .Should().Be("stub-rule-interpreter/1.0.0");
        }

        // Author attempting to approve → 403 (approval requires Reviewer).
        var authorApprove = await authorClient.PostAsJsonAsync(
            $"/api/rules/{TestKey}/approve", new { approver = "author" });
        authorApprove.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // Reviewer approves → 200.
        var reviewerClient = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "reviewer", "reviewer-pw");
        var approveResponse = await reviewerClient.PostAsJsonAsync(
            $"/api/rules/{TestKey}/approve", new { approver = "reviewer" });
        approveResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Read-back shows approval metadata.
        var afterApprove = await authorClient.GetAsync($"/api/rules/{TestKey}");
        var afterJson = await afterApprove.Content.ReadAsStringAsync();
        using (var doc = JsonDocument.Parse(afterJson))
        {
            doc.RootElement.GetProperty("approvedBy").GetString().Should().Be("reviewer");
            doc.RootElement.TryGetProperty("approvedAt", out var approvedAt).Should().BeTrue();
            approvedAt.ValueKind.Should().NotBe(JsonValueKind.Null);
        }
    }

    [Fact]
    public async Task Create_WithLintErrors_Returns422()
    {
        var authorClient = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        // An invalid rule (unknown subject) but with a key so cleanup can remove it if it leaked.
        var invalid = SampleRules.InvalidUnknownSubject().Replace("API_TEST_INVALID", LintRejectKey);
        var ruleJson = JsonDocument.Parse(invalid).RootElement;

        var response = await authorClient.PostAsJsonAsync("/api/rules", new { ruleJson });

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.GetProperty("isValid").GetBoolean().Should().BeFalse();

        // And it must NOT have been persisted.
        var getResponse = await authorClient.GetAsync($"/api/rules/{LintRejectKey}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Get_MissingRule_Returns404ProblemDetails()
    {
        var client = await ApiTestHelpers.AuthenticatedClientAsync(_factory, "author", "author-pw");

        var response = await client.GetAsync("/api/rules/NO_SUCH_RULE_XYZ");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.GetProperty("status").GetInt32().Should().Be(404);
    }
}
