using System.Globalization;
using System.Text.Json;
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
/// Authoring tools: natural-language interpretation, vocabulary linting, round-trip paraphrasing, and
/// corpus dry-run preview. These are read-only / non-persisting — they help an author shape a rule before
/// it is saved via <c>RulesController</c>. The mutating authoring actions require the Author role; the
/// read-only vocabulary tree is available to any authenticated principal. (ASP.NET combines stacked
/// <see cref="AuthorizeAttribute"/> requirements with AND semantics, so the Author policy is applied
/// per-action rather than at the class level — otherwise it would also gate the vocabulary read.)
/// </summary>
[ApiController]
[Route("api/authoring")]
[Authorize]
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

    /// <summary>
    /// Returns the controlled vocabulary as an OBJECT → PROPERTY tree (plus operator and outcome names) so
    /// an authoring UI can offer scoped pickers. Readable by any authenticated role.
    /// </summary>
    /// <returns>The vocabulary tree.</returns>
    [HttpGet("vocabulary")]
    [ProducesResponseType(typeof(VocabularyTreeDto), StatusCodes.Status200OK)]
    public ActionResult<VocabularyTreeDto> Vocabulary()
    {
        var objects = _vocabulary.Subjects
            .GroupBy(s => ObjectName(s.Path), StringComparer.Ordinal)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new VocabularyObjectDto
            {
                Name = g.Key,
                Label = TitleCase(g.Key),
                Properties = g
                    .OrderBy(s => s.Path, StringComparer.Ordinal)
                    .Select(s => new VocabularyPropertyDto
                    {
                        Path = s.Path,
                        Name = PropertyName(g.Key, s.Path),
                        DataType = s.DataType.ToString(),
                    })
                    .ToList(),
            })
            .ToList();

        var operators = _vocabulary.Operators
            .Select(o => o.ToString())
            .OrderBy(o => o, StringComparer.Ordinal)
            .ToList();

        var outcomes = _vocabulary.Outcomes
            .Select(o => o.ToString())
            .OrderBy(o => o, StringComparer.Ordinal)
            .ToList();

        return Ok(new VocabularyTreeDto
        {
            Objects = objects,
            Operators = operators,
            Outcomes = outcomes,
        });
    }

    /// <summary>Interprets a natural-language rule into a candidate rule definition.</summary>
    /// <param name="request">The natural-language request (optionally scoped to objects / properties).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The candidate, confidence, unmapped phrases, and gaps; 400 on unknown scope; 503 when the interpreter is unavailable.</returns>
    [HttpPost("interpret")]
    [Authorize(Policy = VdfPolicies.CanAuthor)]
    [ProducesResponseType(typeof(InterpretResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<InterpretResponse>> Interpret(
        [FromBody] InterpretRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryResolveScopedCatalog(request, out var scoped, out var scopeError))
        {
            return Problem(
                title: "Unknown vocabulary scope.",
                detail: scopeError,
                statusCode: StatusCodes.Status400BadRequest);
        }

        InterpretationResult result;
        try
        {
            result = await _interpreter
                .InterpretAsync(request.NaturalLanguage, scoped, cancellationToken)
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
    [Authorize(Policy = VdfPolicies.CanAuthor)]
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
    [Authorize(Policy = VdfPolicies.CanAuthor)]
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
    [Authorize(Policy = VdfPolicies.CanAuthor)]
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

    /// <summary>
    /// Resolves the catalog the interpreter should ground against from the request's optional scope.
    /// Property scope takes precedence over object scope; an empty scope yields the full catalog.
    /// Validates that every requested property is a known subject and every requested object matches at
    /// least one subject, so the UI can never silently scope to nothing.
    /// </summary>
    private bool TryResolveScopedCatalog(InterpretRequest request, out VocabularyCatalog scoped, out string? error)
    {
        scoped = _vocabulary;
        error = null;

        var properties = request.Properties?.Where(p => !string.IsNullOrWhiteSpace(p)).ToList();
        if (properties is { Count: > 0 })
        {
            var unknown = properties.Where(p => !_vocabulary.IsKnownSubject(p)).Distinct(StringComparer.Ordinal).ToList();
            if (unknown.Count > 0)
            {
                error = $"Unknown properties: {string.Join(", ", unknown)}.";
                return false;
            }

            scoped = _vocabulary.Subset(properties);
            return true;
        }

        var objects = request.Objects?.Where(o => !string.IsNullOrWhiteSpace(o)).ToList();
        if (objects is { Count: > 0 })
        {
            var objectSet = new HashSet<string>(objects, StringComparer.Ordinal);
            var matchedPaths = _vocabulary.Subjects
                .Where(s => objectSet.Contains(ObjectName(s.Path)))
                .Select(s => s.Path)
                .ToList();

            var knownObjects = _vocabulary.Subjects
                .Select(s => ObjectName(s.Path))
                .ToHashSet(StringComparer.Ordinal);
            var unknown = objects.Where(o => !knownObjects.Contains(o)).Distinct(StringComparer.Ordinal).ToList();
            if (unknown.Count > 0)
            {
                error = $"Unknown objects (no matching subjects): {string.Join(", ", unknown)}.";
                return false;
            }

            scoped = _vocabulary.Subset(matchedPaths);
            return true;
        }

        // No scope supplied — full catalog (current behavior).
        return true;
    }

    /// <summary>The object name for a subject path: the first dotted segment (e.g. <c>"order"</c> for <c>"order.client.nyStatus"</c>).</summary>
    private static string ObjectName(string path)
    {
        var dot = path.IndexOf('.');
        return dot < 0 ? path : path[..dot];
    }

    /// <summary>The property name relative to its object: the path minus the <c>object.</c> prefix (e.g. <c>"client.nyStatus"</c>).</summary>
    private static string PropertyName(string objectName, string path) =>
        path.Length > objectName.Length && path[objectName.Length] == '.'
            ? path[(objectName.Length + 1)..]
            : path;

    /// <summary>Title-cases an object name for display (e.g. <c>"order"</c> → <c>"Order"</c>).</summary>
    private static string TitleCase(string name) =>
        string.IsNullOrEmpty(name)
            ? name
            : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name);
}
