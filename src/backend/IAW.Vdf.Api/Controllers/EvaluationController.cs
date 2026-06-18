using System.Text.Json;
using IAW.Vdf.Api.Dtos;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Triggers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IAW.Vdf.Api.Controllers;

/// <summary>
/// Evaluates a facts document against the active, Postgres-stored rule set and returns the produced
/// outcomes, the full per-rule decision trace, and the post-run (derived) facts. Available to any
/// authenticated principal.
/// </summary>
[ApiController]
[Route("api/evaluate")]
[Authorize]
public sealed class EvaluationController : ControllerBase
{
    private readonly IRuleEvaluator _evaluator;
    private readonly ILogger<EvaluationController> _logger;

    /// <summary>Creates the controller.</summary>
    /// <param name="evaluator">The rule evaluator (engine wired to the EF repository).</param>
    /// <param name="logger">The logger.</param>
    public EvaluationController(IRuleEvaluator evaluator, ILogger<EvaluationController> logger)
    {
        _evaluator = evaluator;
        _logger = logger;
    }

    /// <summary>Evaluates the supplied facts.</summary>
    /// <param name="request">The evaluation request (facts JSON object, optional rule set and trigger type).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The outcomes, trace, and post-run facts.</returns>
    [HttpPost]
    [ProducesResponseType(typeof(EvaluateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<EvaluateResponse>> Evaluate(
        [FromBody] EvaluateRequest request,
        CancellationToken cancellationToken)
    {
        if (request.FactsJson.ValueKind != JsonValueKind.Object)
        {
            return Problem(
                title: "factsJson must be a JSON object.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        FactDocument facts;
        try
        {
            facts = FactDocument.Parse(request.FactsJson.GetRawText());
        }
        catch (Exception ex)
        {
            return Problem(
                title: "factsJson could not be parsed.",
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest);
        }

        var trigger = new Trigger
        {
            Type = request.TriggerType ?? TriggerType.OrderEvent,
            EventName = "api-evaluate",
        };

        var evaluation = new EvaluationRequest
        {
            Trigger = trigger,
            Facts = facts,
            AsOf = DateTimeOffset.UtcNow,
            RuleSet = request.RuleSet,
        };

        var result = await _evaluator.EvaluateAsync(evaluation, cancellationToken).ConfigureAwait(false);

        // Audit (no PHI): record only counts and the rule set, never the facts payload.
        _logger.LogInformation(
            "Evaluation by {User}: ruleSet={RuleSet} outcomes={Outcomes} rulesTraced={Traced}.",
            User.Identity?.Name ?? "anonymous", request.RuleSet ?? "(all)",
            result.Outcomes.Count, result.Trace.Count);

        return Ok(EvaluateResponse.From(result));
    }
}
