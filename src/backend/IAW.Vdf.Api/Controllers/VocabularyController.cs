using System.Globalization;
using IAW.Vdf.Api.Auth;
using IAW.Vdf.Api.Dtos;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Persistence;
using IAW.Vdf.Persistence.Entities;
using IAW.Vdf.Persistence.Vocabulary;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Api.Controllers;

/// <summary>
/// Administers the GOVERNED, DB-backed vocabulary of SUBJECTS (objects/properties). Objects and properties
/// can be added or deprecated at runtime without a redeploy; the engine's operators and outcomes remain a
/// closed grammar and are NOT user-managed here. Every action requires the Admin role
/// (<see cref="VdfPolicies.CanAdminister"/>) and is audited via structured logs (who / what / when, no PHI).
///
/// Deprecate-vs-retire semantics:
/// <list type="bullet">
///   <item><b>Deprecate</b> marks a subject <c>Deprecated</c> but leaves it resolvable, so live rules that
///         reference it keep evaluating; it is simply hidden from new authoring.</item>
///   <item><b>Retire</b> (DELETE) physically removes the row and is allowed ONLY when the subject is already
///         <c>Deprecated</c> AND no active rule references it (impact count == 0).</item>
/// </list>
/// </summary>
[ApiController]
[Route("api/vocabulary")]
[Authorize(Policy = VdfPolicies.CanAdminister)]
public sealed class VocabularyController : ControllerBase
{
    private readonly VdfDbContext _db;
    private readonly IVocabularyCatalogProvider _provider;
    private readonly VocabularyImpactAnalyzer _impact;
    private readonly ILogger<VocabularyController> _logger;

    /// <summary>Creates the controller.</summary>
    public VocabularyController(
        VdfDbContext db,
        IVocabularyCatalogProvider provider,
        VocabularyImpactAnalyzer impact,
        ILogger<VocabularyController> logger)
    {
        _db = db;
        _provider = provider;
        _impact = impact;
        _logger = logger;
    }

    /// <summary>
    /// Lists ALL governed subjects (including deprecated), grouped object → properties with status. The
    /// authoring tree (<c>GET /api/authoring/vocabulary</c>) remains active-only; this admin view shows
    /// everything so a governor sees the full lifecycle.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The grouped admin listing.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(VocabularyAdminListDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<VocabularyAdminListDto>> List(CancellationToken cancellationToken)
    {
        var subjects = await _db.VocabularySubjects
            .AsNoTracking()
            .OrderBy(s => s.Path)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var objects = subjects
            .GroupBy(s => s.ObjectName, StringComparer.Ordinal)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new VocabularyObjectGroupDto
            {
                Name = g.Key,
                Label = VocabularyPathConventions.Humanize(g.Key),
                Properties = g
                    .OrderBy(s => s.Path, StringComparer.Ordinal)
                    .Select(VocabularySubjectDto.From)
                    .ToList(),
            })
            .ToList();

        return Ok(new VocabularyAdminListDto { Objects = objects });
    }

    /// <summary>
    /// Creates a new Active governed subject and refreshes the live catalog.
    ///
    /// IMPORTANT: adding a subject does NOT make facts appear at evaluation time. The vocabulary only
    /// declares that a fact path is LEGAL for authoring and grounding; the host's <c>IFactProvider</c> must
    /// still supply a value for that path when a rule is evaluated, otherwise the fact resolves to null.
    /// </summary>
    /// <param name="request">The new subject (path + dataType, optional label/description).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>201 with the created subject; 400 on an invalid path/dataType; 409 if the path already exists.</returns>
    [HttpPost]
    [ProducesResponseType(typeof(VocabularySubjectDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<VocabularySubjectDto>> Create(
        [FromBody] CreateVocabularySubjectRequest request,
        CancellationToken cancellationToken)
    {
        if (!VocabularyPathConventions.IsValidPath(request.Path))
        {
            return Problem(
                title: "Invalid subject path.",
                detail: "Path must be dotted segments of [A-Za-z][A-Za-z0-9]* with an optional trailing '[]'.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (!Enum.TryParse<SubjectDataType>(request.DataType, ignoreCase: true, out var dataType))
        {
            return Problem(
                title: "Invalid data type.",
                detail: "dataType must be one of: String, Number, Date, Boolean, Collection.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var exists = await _db.VocabularySubjects
            .AnyAsync(s => s.Path == request.Path, cancellationToken)
            .ConfigureAwait(false);
        if (exists)
        {
            return Problem(
                title: "Subject already exists.",
                detail: $"The subject path '{request.Path}' is already defined.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var objectName = VocabularyPathConventions.ObjectName(request.Path);
        var now = DateTimeOffset.UtcNow;
        var entity = new VocabularySubjectEntity
        {
            Id = Guid.NewGuid(),
            Path = request.Path,
            ObjectName = objectName,
            Label = string.IsNullOrWhiteSpace(request.Label)
                ? VocabularyPathConventions.Humanize(objectName)
                : request.Label!,
            DataType = dataType.ToString(),
            Description = request.Description,
            Status = VocabularySubjectStatus.Active,
            Version = 1,
            EffectiveDate = now,
            CreatedBy = CurrentUser(),
            CreatedAt = now,
        };

        _db.VocabularySubjects.Add(entity);
        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await _provider.RefreshAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Vocabulary subject created: {Path} ({DataType}) by {User}.",
            entity.Path, entity.DataType, entity.CreatedBy);

        return CreatedAtAction(
            nameof(List),
            null,
            VocabularySubjectDto.From(entity));
    }

    /// <summary>
    /// Returns the active rules that reference the supplied subject path (impact analysis). The path is
    /// URL-encoded in the route; a <c>?path=</c> query parameter is also accepted for robustness.
    /// </summary>
    /// <param name="path">The URL-encoded subject path.</param>
    /// <param name="pathQuery">An optional query-string override for the path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The impact list.</returns>
    [HttpGet("{path}/impact")]
    [ProducesResponseType(typeof(VocabularyImpactDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<VocabularyImpactDto>> Impact(
        string path,
        [FromQuery(Name = "path")] string? pathQuery,
        CancellationToken cancellationToken)
    {
        var resolved = ResolvePath(path, pathQuery);
        var impact = await BuildImpactAsync(resolved, cancellationToken).ConfigureAwait(false);
        return Ok(impact);
    }

    /// <summary>
    /// Deprecates a subject: marks it <c>Deprecated</c> (still resolvable so live rules keep working) and
    /// records the approver. Refreshes the catalog and returns the impact list so the UI can warn about the
    /// rules that still depend on it.
    /// </summary>
    /// <param name="path">The URL-encoded subject path.</param>
    /// <param name="pathQuery">An optional query-string override for the path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>200 with the impact list; 404 if the subject is unknown.</returns>
    [HttpPost("{path}/deprecate")]
    [ProducesResponseType(typeof(VocabularyImpactDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<VocabularyImpactDto>> Deprecate(
        string path,
        [FromQuery(Name = "path")] string? pathQuery,
        CancellationToken cancellationToken)
    {
        var resolved = ResolvePath(path, pathQuery);
        var entity = await _db.VocabularySubjects
            .FirstOrDefaultAsync(s => s.Path == resolved, cancellationToken)
            .ConfigureAwait(false);
        if (entity is null)
        {
            return Problem(
                title: "Subject not found.",
                detail: $"No subject with path '{resolved}'.",
                statusCode: StatusCodes.Status404NotFound);
        }

        var now = DateTimeOffset.UtcNow;
        entity.Status = VocabularySubjectStatus.Deprecated;
        entity.ApprovedBy = CurrentUser();
        entity.ApprovedAt = now;
        entity.Version += 1;
        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await _provider.RefreshAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Vocabulary subject deprecated: {Path} by {User}.", resolved, entity.ApprovedBy);

        var impact = await BuildImpactAsync(resolved, cancellationToken).ConfigureAwait(false);
        return Ok(impact);
    }

    /// <summary>
    /// Retires (physically deletes) a subject. Allowed ONLY when the subject is already <c>Deprecated</c>
    /// AND no active rule references it. Otherwise returns 409 with the impact list so the caller knows what
    /// is blocking retirement.
    /// </summary>
    /// <param name="path">The URL-encoded subject path.</param>
    /// <param name="pathQuery">An optional query-string override for the path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>204 on success; 404 if unknown; 409 if still active or still referenced.</returns>
    [HttpDelete("{path}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Retire(
        string path,
        [FromQuery(Name = "path")] string? pathQuery,
        CancellationToken cancellationToken)
    {
        var resolved = ResolvePath(path, pathQuery);
        var entity = await _db.VocabularySubjects
            .FirstOrDefaultAsync(s => s.Path == resolved, cancellationToken)
            .ConfigureAwait(false);
        if (entity is null)
        {
            return Problem(
                title: "Subject not found.",
                detail: $"No subject with path '{resolved}'.",
                statusCode: StatusCodes.Status404NotFound);
        }

        if (!string.Equals(entity.Status, VocabularySubjectStatus.Deprecated, StringComparison.Ordinal))
        {
            return Problem(
                title: "Subject must be deprecated before retirement.",
                detail: $"Deprecate '{resolved}' before retiring it.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var referencingRules = await _impact
            .FindReferencingRulesAsync(resolved, cancellationToken)
            .ConfigureAwait(false);
        if (referencingRules.Count > 0)
        {
            var problem = new ProblemDetails
            {
                Title = "Subject is still referenced by active rules.",
                Detail = $"'{resolved}' is referenced by {referencingRules.Count} active rule(s); cannot retire.",
                Status = StatusCodes.Status409Conflict,
            };
            problem.Extensions["referencingRules"] = referencingRules
                .Select(ReferencingRuleDto.From)
                .ToList();
            return Conflict(problem);
        }

        _db.VocabularySubjects.Remove(entity);
        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await _provider.RefreshAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Vocabulary subject retired: {Path} by {User}.", resolved, CurrentUser());

        return NoContent();
    }

    /// <summary>Manually rebuilds the live catalog cache from the DB.</summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>204 on success.</returns>
    [HttpPost("refresh")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Refresh(CancellationToken cancellationToken)
    {
        await _provider.RefreshAsync(cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Vocabulary catalog refreshed by {User}.", CurrentUser());
        return NoContent();
    }

    private async Task<VocabularyImpactDto> BuildImpactAsync(string path, CancellationToken cancellationToken)
    {
        var rules = await _impact
            .FindReferencingRulesAsync(path, cancellationToken)
            .ConfigureAwait(false);

        return new VocabularyImpactDto
        {
            Path = path,
            ReferencingRules = rules.Select(ReferencingRuleDto.From).ToList(),
        };
    }

    /// <summary>
    /// Resolves the effective subject path from the route segment and an optional query override. Route
    /// values arrive already URL-decoded by ASP.NET; the explicit query parameter wins when supplied so a
    /// caller can always pass a dotted/bracketed path unambiguously.
    /// </summary>
    private static string ResolvePath(string routePath, string? queryPath) =>
        !string.IsNullOrWhiteSpace(queryPath)
            ? Uri.UnescapeDataString(queryPath)
            : Uri.UnescapeDataString(routePath);

    /// <summary>The authenticated principal's name for audit, defaulting to <c>"system"</c>.</summary>
    private string CurrentUser() =>
        User.Identity?.Name
        ?? User.FindFirst("sub")?.Value
        ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
        ?? "system";
}
