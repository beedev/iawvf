using IAW.Vdf.Api.Auth;
using IAW.Vdf.Api.Dtos;
using IAW.Vdf.Api.Governance;
using IAW.Vdf.Api.Infrastructure;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Authoring.Linting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IAW.Vdf.Api.Controllers;

/// <summary>
/// The governed rule repository (backed by Postgres). Reads are open to any authenticated principal;
/// mutations are gated by role: authoring (create / new version) requires Author, approval requires
/// Reviewer, and promote / disable require Admin. Every mutation is audited via structured logs
/// (who / what / when) with no PHI.
/// </summary>
[ApiController]
[Route("api/rules")]
[Authorize]
public sealed class RulesController : ControllerBase
{
    private readonly IRuleRepository _repository;
    private readonly RuleGovernanceService _governance;
    private readonly VocabularyLinter _linter;
    private readonly ILogger<RulesController> _logger;

    /// <summary>Creates the controller.</summary>
    public RulesController(
        IRuleRepository repository,
        RuleGovernanceService governance,
        VocabularyLinter linter,
        ILogger<RulesController> logger)
    {
        _repository = repository;
        _governance = governance;
        _linter = linter;
        _logger = logger;
    }

    /// <summary>Lists active rules at an optional point in time, optionally filtered by rule set.</summary>
    /// <param name="asOf">The "as of" instant for effective-date windowing; defaults to now.</param>
    /// <param name="ruleSet">An optional rule-set filter.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The active rule summaries.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<RuleSummaryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<RuleSummaryDto>>> List(
        [FromQuery] DateTimeOffset? asOf,
        [FromQuery] string? ruleSet,
        CancellationToken cancellationToken)
    {
        var rules = await _repository
            .GetActiveRulesAsync(asOf ?? DateTimeOffset.UtcNow, ruleSet, cancellationToken)
            .ConfigureAwait(false);

        return Ok(rules.Select(RuleSummaryDto.From).ToList());
    }

    /// <summary>Returns a single rule (active version) by key.</summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The rule detail, or 404 if not found.</returns>
    [HttpGet("{key}")]
    [ProducesResponseType(typeof(RuleDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RuleDetailDto>> GetByKey(string key, CancellationToken cancellationToken)
    {
        var rule = await _repository.GetByKeyAsync(key, cancellationToken).ConfigureAwait(false);
        if (rule is null)
        {
            return Problem(title: $"Rule '{key}' was not found.", statusCode: StatusCodes.Status404NotFound);
        }

        var meta = await _governance.GetActiveVersionMetadataAsync(key, cancellationToken).ConfigureAwait(false);
        return Ok(RuleDetailDto.From(rule, meta));
    }

    /// <summary>Creates / saves a rule (Author). Lints before save; rejects with 422 on lint errors.</summary>
    /// <param name="request">The create request (rule JSON + optional provenance).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The stored version, or 422 when the rule has lint errors.</returns>
    [HttpPost]
    [Authorize(Policy = VdfPolicies.CanAuthor)]
    [ProducesResponseType(typeof(RuleMutationResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(LintReportDto), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RuleMutationResponse>> Create(
        [FromBody] CreateRuleRequest request,
        CancellationToken cancellationToken)
    {
        if (!RuleJsonHelper.TryParse(request.RuleJson, out var rule, out var error))
        {
            return Problem(title: error, statusCode: StatusCodes.Status400BadRequest);
        }

        // Validation gate: lint and reject on any error-severity finding.
        var report = _linter.Lint(rule!);
        if (!report.IsValid)
        {
            _logger.LogWarning("Rejected save of rule {Key} by {User}: {ErrorCount} lint error(s).",
                rule!.Key, User.Identity?.Name ?? "anonymous",
                report.Findings.Count(f => f.Severity == FindingSeverity.Error));
            return UnprocessableEntity(LintReportDto.From(report));
        }

        var author = User.Identity?.Name ?? "system";
        var version = await _governance
            .SaveWithProvenanceAsync(rule!, author, request.AuthorNl, request.InterpreterVersion, cancellationToken)
            .ConfigureAwait(false);

        _logger.LogInformation("Rule {Key} v{Version} saved by {User} (interpreter={Interpreter}).",
            rule!.Key, version, author, request.InterpreterVersion ?? "(none)");

        var response = new RuleMutationResponse
        {
            Key = rule.Key,
            Version = version,
            Message = $"Rule '{rule.Key}' saved as version {version}.",
        };
        return CreatedAtAction(nameof(GetByKey), new { key = rule.Key }, response);
    }

    /// <summary>Approves the active version of a rule (Reviewer).</summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="request">The approve request (approver identity).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The approved version, or 404 when the rule / active version is absent.</returns>
    [HttpPost("{key}/approve")]
    [Authorize(Policy = VdfPolicies.CanReview)]
    [ProducesResponseType(typeof(RuleMutationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RuleMutationResponse>> Approve(
        string key,
        [FromBody] ApproveRequest request,
        CancellationToken cancellationToken)
    {
        // Audit integrity (H1): the approval identity is the AUTHENTICATED principal, never the
        // caller-supplied request body. request.Approver is ignored for the persisted audit identity
        // (it remains in the DTO only as an optional display hint).
        var approver = User.Identity?.Name
            ?? throw new InvalidOperationException("Authenticated principal has no name claim.");

        var (status, version) = await _governance
            .ApproveActiveVersionAsync(key, approver, cancellationToken)
            .ConfigureAwait(false);

        if (status != GovernanceStatus.Succeeded)
        {
            return Problem(
                title: $"Rule '{key}' has no active version to approve.",
                statusCode: StatusCodes.Status404NotFound);
        }

        _logger.LogInformation("Rule {Key} v{Version} approved by {Approver}.",
            key, version, approver);

        return Ok(new RuleMutationResponse
        {
            Key = key,
            Version = version,
            Message = $"Rule '{key}' version {version} approved.",
        });
    }

    /// <summary>Adds a new effective-dated version of an existing rule (Author). Lints before save.</summary>
    /// <param name="key">The rule business key (the rule JSON's key must match).</param>
    /// <param name="request">The add-version request (rule JSON + effective date).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The new version, or 400/422 on validation failure.</returns>
    [HttpPost("{key}/versions")]
    [Authorize(Policy = VdfPolicies.CanAuthor)]
    [ProducesResponseType(typeof(RuleMutationResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(LintReportDto), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RuleMutationResponse>> AddVersion(
        string key,
        [FromBody] AddVersionRequest request,
        CancellationToken cancellationToken)
    {
        if (!RuleJsonHelper.TryParse(request.RuleJson, out var parsed, out var error))
        {
            return Problem(title: error, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!string.Equals(parsed!.Key, key, StringComparison.Ordinal))
        {
            return Problem(
                title: $"ruleJson key '{parsed.Key}' does not match route key '{key}'.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var report = _linter.Lint(parsed);
        if (!report.IsValid)
        {
            return UnprocessableEntity(LintReportDto.From(report));
        }

        // Carry the supplied effective date onto the persisted version.
        var rule = WithEffectiveDate(parsed, request.EffectiveDate);

        var author = User.Identity?.Name ?? "system";
        var version = await _governance
            .SaveWithProvenanceAsync(rule, author, null, null, cancellationToken)
            .ConfigureAwait(false);

        _logger.LogInformation("Rule {Key} v{Version} (effective {Effective:o}) added by {User}.",
            key, version, request.EffectiveDate, author);

        var response = new RuleMutationResponse
        {
            Key = key,
            Version = version,
            Message = $"Rule '{key}' version {version} added, effective {request.EffectiveDate:o}.",
        };
        return CreatedAtAction(nameof(GetByKey), new { key }, response);
    }

    /// <summary>Promotes (enables) a rule (Admin).</summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The mutation result, or 404 when the rule is absent.</returns>
    [HttpPost("{key}/promote")]
    [Authorize(Policy = VdfPolicies.CanAdminister)]
    [ProducesResponseType(typeof(RuleMutationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<ActionResult<RuleMutationResponse>> Promote(string key, CancellationToken cancellationToken)
        => SetEnabled(key, enabled: true, action: "promoted", cancellationToken);

    /// <summary>Disables a rule (Admin). Disabled rules are excluded from active evaluation.</summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The mutation result, or 404 when the rule is absent.</returns>
    [HttpPost("{key}/disable")]
    [Authorize(Policy = VdfPolicies.CanAdminister)]
    [ProducesResponseType(typeof(RuleMutationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<ActionResult<RuleMutationResponse>> Disable(string key, CancellationToken cancellationToken)
        => SetEnabled(key, enabled: false, action: "disabled", cancellationToken);

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────

    private async Task<ActionResult<RuleMutationResponse>> SetEnabled(
        string key, bool enabled, string action, CancellationToken cancellationToken)
    {
        var status = await _governance.SetEnabledAsync(key, enabled, cancellationToken).ConfigureAwait(false);
        if (status == GovernanceStatus.RuleNotFound)
        {
            return Problem(title: $"Rule '{key}' was not found.", statusCode: StatusCodes.Status404NotFound);
        }

        _logger.LogInformation("Rule {Key} {Action} by {User}.", key, action, User.Identity?.Name ?? "anonymous");
        return Ok(new RuleMutationResponse { Key = key, Version = null, Message = $"Rule '{key}' {action}." });
    }

    private static RuleDefinition WithEffectiveDate(RuleDefinition rule, DateTimeOffset effectiveDate) => new()
    {
        Key = rule.Key,
        Name = rule.Name,
        Description = rule.Description,
        RuleSet = rule.RuleSet,
        Priority = rule.Priority,
        Phase = rule.Phase,
        Enabled = rule.Enabled,
        Version = rule.Version,
        EffectiveDate = effectiveDate,
        ExpiryDate = rule.ExpiryDate,
        AppliesWhen = rule.AppliesWhen,
        Assert = rule.Assert,
        OnSuccess = rule.OnSuccess,
        Recover = rule.Recover,
        OnFailure = rule.OnFailure,
        // Preserve the authored scope (governed metadata) when re-dating a version.
        Scope = rule.Scope,
    };
}
