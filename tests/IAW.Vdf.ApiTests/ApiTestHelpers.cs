using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using IAW.Vdf.Persistence;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.ApiTests;

/// <summary>Shared helpers for the API test suite: login, authenticated clients, and DB cleanup.</summary>
internal static class ApiTestHelpers
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Logs in as a dev user and returns the bearer token.</summary>
    public static async Task<string> LoginAsync(HttpClient client, string username, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { username, password });
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<LoginBody>(Json);
        return body!.Token;
    }

    /// <summary>Creates a client whose Authorization header carries a token for the given dev user.</summary>
    public static async Task<HttpClient> AuthenticatedClientAsync(
        VdfApiFactory factory, string username, string password)
    {
        var client = factory.CreateClient();
        var token = await LoginAsync(client, username, password);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>Deletes a rule (identity + versions) by key so tests are repeatable.</summary>
    public static async Task DeleteRuleAsync(VdfApiFactory factory, string key)
    {
        await using var db = factory.CreateDbContext();
        var rule = await db.Rules.Include(r => r.Versions).FirstOrDefaultAsync(r => r.RuleKey == key);
        if (rule is null)
        {
            return;
        }

        db.RuleVersions.RemoveRange(rule.Versions);
        db.Rules.Remove(rule);
        await db.SaveChangesAsync();
    }

    private sealed record LoginBody(string Token, DateTimeOffset ExpiresAt, string[] Roles);
}
