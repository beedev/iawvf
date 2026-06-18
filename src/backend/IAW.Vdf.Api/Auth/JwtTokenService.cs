using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace IAW.Vdf.Api.Auth;

/// <summary>Issues signed JWT bearer tokens carrying the principal's name and roles.</summary>
public sealed class JwtTokenService
{
    private readonly JwtOptions _options;

    /// <summary>Creates the token service.</summary>
    /// <param name="options">The bound JWT options (must contain a signing key).</param>
    public JwtTokenService(IOptions<JwtOptions> options) => _options = options.Value;

    /// <summary>
    /// Issues a signed token for the supplied identity and roles.
    /// </summary>
    /// <param name="username">The subject (login name).</param>
    /// <param name="roles">The roles to embed as role claims.</param>
    /// <returns>The compact serialized JWT and its UTC expiry.</returns>
    /// <exception cref="InvalidOperationException">No signing key is configured.</exception>
    public (string Token, DateTimeOffset ExpiresAt) Issue(string username, IEnumerable<string> roles)
    {
        if (string.IsNullOrWhiteSpace(_options.Key))
        {
            throw new InvalidOperationException(
                "No JWT signing key is configured (Jwt:Key). Supply one via configuration / secret store.");
        }

        var expires = DateTimeOffset.UtcNow.AddMinutes(_options.ExpiryMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, username),
            new(ClaimTypes.Name, username),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires.UtcDateTime,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
