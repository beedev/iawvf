using IAW.Vdf.Api.Auth;
using IAW.Vdf.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IAW.Vdf.Api.Controllers;

/// <summary>
/// Development authentication. Issues signed JWT bearer tokens for known dev users so the rest of the
/// API's <c>[Authorize]</c> surface can be exercised locally and in tests. A production deployment would
/// replace this with the enterprise identity provider.
/// </summary>
[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public sealed class AuthController : ControllerBase
{
    private readonly JwtTokenService _tokens;
    private readonly ILogger<AuthController> _logger;

    /// <summary>Creates the controller.</summary>
    /// <param name="tokens">The JWT token service.</param>
    /// <param name="logger">The logger.</param>
    public AuthController(JwtTokenService tokens, ILogger<AuthController> logger)
    {
        _tokens = tokens;
        _logger = logger;
    }

    /// <summary>Authenticates a dev user and issues a signed JWT carrying their roles.</summary>
    /// <param name="request">The login request.</param>
    /// <returns>The token, expiry, and granted roles; 401 on bad credentials.</returns>
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<LoginResponse> Login([FromBody] LoginRequest request)
    {
        var user = DevUserDirectory.Authenticate(request.Username, request.Password);
        if (user is null)
        {
            // Never log the submitted password; log only the (non-PHI) attempted username.
            _logger.LogWarning("Failed dev login attempt for user {Username}.", request.Username);
            return Problem(
                title: "Invalid credentials.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var (token, expiresAt) = _tokens.Issue(user.Username, user.Roles);
        _logger.LogInformation("Issued dev token for {Username} with roles {Roles}.",
            user.Username, string.Join(",", user.Roles));

        return Ok(new LoginResponse { Token = token, ExpiresAt = expiresAt, Roles = user.Roles });
    }
}
