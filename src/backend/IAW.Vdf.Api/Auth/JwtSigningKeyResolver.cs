namespace IAW.Vdf.Api.Auth;

/// <summary>
/// Resolves the JWT signing key at application startup and enforces the fail-fast policy:
/// the key is REQUIRED in non-Development environments, and a deterministic dev fallback is used in
/// Development so the local surface (and Swagger) always works without secrets.
/// <para>
/// This logic is extracted from <c>Program.cs</c> so it can be exercised directly by tests without
/// standing up a full host: a missing key in Production must throw a clear startup error, never a
/// per-request 500 that would also take down anonymous endpoints.
/// </para>
/// </summary>
public static class JwtSigningKeyResolver
{
    /// <summary>
    /// A deterministic signing key used only in Development when no <c>Jwt:Key</c> is configured.
    /// Never used outside Development — production environments must supply a real key.
    /// </summary>
    public const string DevelopmentFallbackSigningKey =
        "iaw-vdf-development-only-signing-key-not-for-production-use-32b+";

    /// <summary>
    /// Resolves the effective signing key, applying the fail-fast / dev-fallback policy.
    /// </summary>
    /// <param name="configuredKey">The key read from configuration (may be null/blank).</param>
    /// <param name="isDevelopment">Whether the host is running in the Development environment.</param>
    /// <returns>The non-empty signing key to use.</returns>
    /// <exception cref="InvalidOperationException">
    /// Thrown when no key is configured and the environment is NOT Development.
    /// </exception>
    public static string Resolve(string? configuredKey, bool isDevelopment)
    {
        if (!string.IsNullOrWhiteSpace(configuredKey))
        {
            return configuredKey!;
        }

        if (isDevelopment)
        {
            return DevelopmentFallbackSigningKey;
        }

        throw new InvalidOperationException(
            $"No JWT signing key configured ('{JwtOptions.SectionName}:Key'). In non-Development " +
            "environments the signing key must be supplied via configuration, an environment variable, " +
            "or a secret store before the application can start.");
    }
}
