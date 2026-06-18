using System.Text.Json;
using System.Text.Json.Nodes;
using IAW.Vdf.Api.Auth;
using IAW.Vdf.Api.Dtos;
using IAW.Vdf.Api.Infrastructure;
using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.DryRun;
using IAW.Vdf.Authoring.Linting;
using IAW.Vdf.Authoring.Paraphrase;
using IAW.Vdf.Core.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IAW.Vdf.Api.Controllers;

/// <summary>
/// Authoring tools (Author role): natural-language interpretation, vocabulary linting, round-trip
/// paraphrasing, and corpus dry-run preview. These are read-only / non-persisting — they help an author
/// shape a rule before it is saved via <c>RulesController</c>.
/// </summary>
[ApiController]
[Route("api/authoring")]
[Authorize(Policy = VdfPolicies.CanAuthor)]
public sealed class AuthoringController : ControllerBase
{
    private readonly IRuleInterpreter _interpreter;
    private readonly VocabularyCatalog _vocabulary;
    private readonly VocabularyLinter _linter;
    private readonly RoundTripParaphraser _paraphraser;
    private readonly DryRunPreviewer _previewer;
    private readonly ILogger<AuthoringController> _logger;

    /// <summary>Creates the controller.</summary>
    public AuthoringController(
        IRuleInterpreter interpreter,
        VocabularyCatalog vocabulary,
        VocabularyLinter linter,
        RoundTripParaphraser paraphraser,
        DryRunPreviewer previewer,
        ILogger<AuthoringController> logger)
    {
        _interpreter = interpreter;
        _vocabulary = vocabulary;
        _linter = linter;
        _paraphraser = paraphraser;
        _previewer = previewer;
        _logger = logger;
    }

    /// <summary>Interprets a natural-language rule into a candidate rule definition.</summary>
    /// <param name="request">The natural-language request.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The candidate, confidence, unmapped phrases, and gaps; 503 when the interpreter is unavailable.</returns>
    [HttpPost("interpret")]
    [ProducesResponseType(typeof(InterpretResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<InterpretResponse>> Interpret(
        [FromBody] InterpretRequest request,
        CancellationToken cancellationToken)
    {
        InterpretationResult result;
        try
        {
            result = await _interpreter
                .InterpretAsync(request.NaturalLanguage, _vocabulary, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (InvalidOperationException ex)
        {
            // Interpreter disabled / no key configured — degrade gracefully, never 500.
            // M1: never leak ex.Message to the client (it can disclose internal config); the full
            // message is logged server-side below for operators.
            _logger.LogWarning("Interpreter unavailable: {Message}", ex.Message);
            return Problem(
                title: "The rule interpreter is currently unavailable.",
                detail: "The rule interpreter is currently unavailable. Contact your administrator if this persists.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        JsonElement? candidate = null;
        if (result.Candidate is not null)
        {
            using var doc = JsonDocument.Parse(RuleSerializer.Serialize(result.Candidate));
            candidate = doc.RootElement.Clone();
        }

        return Ok(new InterpretResponse
        {
            Candidate = candidate,
            Confidence = result.Confidence,
            UnmappedPhrases = result.UnmappedPhrases,
            Gaps = result.Gaps,
        });
    }

    /// <summary>Lints a rule JSON object against the vocabulary and reference data.</summary>
    /// <param name="request">The rule JSON request.</param>
    /// <returns>The lint report.</returns>
    [HttpPost("lint")]
    [ProducesResponseType(typeof(LintReportDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<LintReportDto> Lint([FromBody] RuleJsonRequest request)
    {
        if (request.RuleJson.ValueKind != JsonValueKind.Object)
        {
            return Problem(title: "ruleJson must be a JSON object.", statusCode: StatusCodes.Status400BadRequest);
        }

        var report = _linter.LintJson(request.RuleJson.GetRawText());
        return Ok(LintReportDto.From(report));
    }

    /// <summary>Produces a deterministic English paraphrase of a rule.</summary>
    /// <param name="request">The rule JSON request.</param>
    /// <returns>The paraphrase.</returns>
    [HttpPost("paraphrase")]
    [ProducesResponseType(typeof(ParaphraseResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<ParaphraseResponse> Paraphrase([FromBody] RuleJsonRequest request)
    {
        if (!RuleJsonHelper.TryParse(request.RuleJson, out var rule, out var error))
        {
            return Problem(title: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var text = _paraphraser.Paraphrase(rule!);
        return Ok(new ParaphraseResponse { Paraphrase = text });
    }

    /// <summary>Dry-runs a candidate rule against the repository fixtures corpus (no side effects).</summary>
    /// <param name="request">The rule JSON request.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The per-fixture dry-run hits.</returns>
    [HttpPost("dry-run")]
    [ProducesResponseType(typeof(DryRunResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<DryRunResponse>> DryRun(
        [FromBody] RuleJsonRequest request,
        CancellationToken cancellationToken)
    {
        if (!RuleJsonHelper.TryParse(request.RuleJson, out var rule, out var error))
        {
            return Problem(title: error, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await _previewer
            .PreviewFromRepoFixturesAsync(rule!, cancellationToken)
            .ConfigureAwait(false);

        return Ok(DryRunResponse.From(result));
    }
}
