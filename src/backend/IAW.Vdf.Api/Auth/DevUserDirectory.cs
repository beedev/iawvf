namespace IAW.Vdf.Api.Auth;

/// <summary>
/// A fixed directory of development users for the local <c>/api/auth/login</c> endpoint. This exists only
/// to exercise the JWT + role pipeline during development and testing; a production deployment would
/// replace this with a real identity provider (OIDC / the enterprise IdP). Passwords here are deliberately
/// non-secret and are never logged.
/// </summary>
public static class DevUserDirectory
{
    /// <summary>A single dev user with a fixed password and role set.</summary>
    /// <param name="Username">The login name.</param>
    /// <param name="Password">The (non-secret, dev-only) password.</param>
    /// <param name="Roles">The roles granted to the user.</param>
    public sealed record DevUser(string Username, string Password, IReadOnlyList<string> Roles);

    private static readonly IReadOnlyDictionary<string, DevUser> Users =
        new Dictionary<string, DevUser>(StringComparer.OrdinalIgnoreCase)
        {
            ["author"] = new("author", "author-pw", new[] { VdfRoles.Author }),
            ["reviewer"] = new("reviewer", "reviewer-pw", new[] { VdfRoles.Reviewer }),
            ["admin"] = new("admin", "admin-pw", new[] { VdfRoles.Admin }),
            // A combined account convenient for end-to-end flows.
            ["lead"] = new("lead", "lead-pw", new[] { VdfRoles.Author, VdfRoles.Reviewer, VdfRoles.Admin }),
        };

    /// <summary>Validates credentials and returns the matching user, or <see langword="null"/>.</summary>
    /// <param name="username">The submitted username.</param>
    /// <param name="password">The submitted password.</param>
    /// <returns>The authenticated user, or <see langword="null"/> when credentials do not match.</returns>
    public static DevUser? Authenticate(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) ||
            !Users.TryGetValue(username, out var user))
        {
            return null;
        }

        // Constant work is unnecessary for a dev directory; correctness only.
        return string.Equals(user.Password, password, StringComparison.Ordinal) ? user : null;
    }
}
