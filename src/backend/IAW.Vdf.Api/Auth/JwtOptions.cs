namespace IAW.Vdf.Api.Auth;

/// <summary>
/// JWT bearer settings bound from the <c>Jwt</c> configuration section. The signing <see cref="Key"/>
/// is supplied by configuration only — a dev default lives in <c>appsettings.Development.json</c>; in
/// production the key MUST come from an environment variable or secret store.
/// </summary>
public sealed class JwtOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Jwt";

    /// <summary>The HMAC signing key. Never hard-coded for production; supplied via config/secret store.</summary>
    public string? Key { get; set; }

    /// <summary>The token issuer.</summary>
    public string Issuer { get; set; } = "iaw-vdf";

    /// <summary>The token audience.</summary>
    public string Audience { get; set; } = "iaw-vdf-clients";

    /// <summary>Token lifetime in minutes.</summary>
    public int ExpiryMinutes { get; set; } = 60;
}
