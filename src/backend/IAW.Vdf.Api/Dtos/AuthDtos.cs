using System.ComponentModel.DataAnnotations;

namespace IAW.Vdf.Api.Dtos;

/// <summary>Dev login request: username + password against the dev user directory.</summary>
public sealed class LoginRequest
{
    /// <summary>The dev username (e.g. <c>author</c>, <c>reviewer</c>, <c>admin</c>, <c>lead</c>).</summary>
    [Required]
    public string Username { get; set; } = string.Empty;

    /// <summary>The dev password.</summary>
    [Required]
    public string Password { get; set; } = string.Empty;
}

/// <summary>The issued bearer token, its expiry, and the granted roles.</summary>
public sealed class LoginResponse
{
    /// <summary>The compact JWT to send as <c>Authorization: Bearer {token}</c>.</summary>
    public required string Token { get; init; }

    /// <summary>The token's UTC expiry.</summary>
    public required DateTimeOffset ExpiresAt { get; init; }

    /// <summary>The roles embedded in the token.</summary>
    public required IReadOnlyList<string> Roles { get; init; }
}
