namespace IAW.Vdf.Abstractions.Evaluation;

/// <summary>The engine façade: evaluates a request against the active rules and returns outcomes, trace, and derived facts.</summary>
public interface IRuleEvaluator
{
    /// <summary>Evaluates the supplied request deterministically.</summary>
    /// <param name="request">The evaluation request.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The evaluation result.</returns>
    Task<EvaluationResult> EvaluateAsync(EvaluationRequest request, CancellationToken cancellationToken = default);
}
