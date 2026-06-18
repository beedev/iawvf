using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace IAW.Vdf.ApiTests;

/// <summary>Health, anonymous access, and login/token issuance tests.</summary>
public sealed class HealthAndAuthTests : IClassFixture<VdfApiFactory>
{
    private readonly VdfApiFactory _factory;

    public HealthAndAuthTests(VdfApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_ReturnsHealthy()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Be("Healthy");
    }

    [Fact]
    public async Task Login_WithValidDevUser_ReturnsToken()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { username = "author", password = "author-pw" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<LoginResult>();
        body!.Token.Should().NotBeNullOrWhiteSpace();
        body.Roles.Should().Contain("Author");
    }

    [Fact]
    public async Task Login_WithBadPassword_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { username = "author", password = "wrong" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private sealed record LoginResult(string Token, DateTimeOffset ExpiresAt, string[] Roles);
}
