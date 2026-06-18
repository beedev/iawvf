namespace IAW.Vdf.Api.Auth;

/// <summary>
/// The closed set of VDF governance roles (G2). A principal may hold one or more roles; authorization
/// policies map each protected capability to the role(s) permitted to invoke it.
/// </summary>
public static class VdfRoles
{
    /// <summary>Authors create, interpret, lint, paraphrase, dry-run, and draft new rule versions.</summary>
    public const string Author = "Author";

    /// <summary>Reviewers approve the active version of a rule.</summary>
    public const string Reviewer = "Reviewer";

    /// <summary>Admins promote and enable/disable rules.</summary>
    public const string Admin = "Admin";
}

/// <summary>
/// Authorization policy names. Each policy is satisfied by membership in one of the roles in
/// <see cref="VdfRoles"/>. Policies are referenced by name on controller actions so the role-to-capability
/// mapping lives in exactly one place (<c>Program.cs</c>).
/// </summary>
public static class VdfPolicies
{
    /// <summary>Authoring capabilities: create / interpret / lint / paraphrase / dry-run / new versions.</summary>
    public const string CanAuthor = "CanAuthor";

    /// <summary>Approval capability: mark the active version approved.</summary>
    public const string CanReview = "CanReview";

    /// <summary>Administrative capability: promote / disable / enable.</summary>
    public const string CanAdminister = "CanAdminister";
}
