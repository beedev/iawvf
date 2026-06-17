using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Core.Engine;

/// <summary>
/// A reconcilable item — a hold, incident, or other stateful outcome attributed to the rule that
/// produced it. Identity is the (rule key, outcome type, scope) triple, so the same rule firing the
/// same effect on the same scope is recognised across runs.
/// </summary>
/// <param name="RuleKey">The key of the rule that produced the outcome.</param>
/// <param name="Outcome">The produced outcome.</param>
public sealed record OpenItem(string RuleKey, Outcome Outcome)
{
    /// <summary>The stable identity used to match items across runs.</summary>
    public (string RuleKey, OutcomeType Type, string? Scope) Identity => (RuleKey, Outcome.Type, Outcome.Scope);
}

/// <summary>The result of reconciling prior open items against the current run's items.</summary>
/// <param name="Opened">Items firing now that were not open before.</param>
/// <param name="Kept">Items that were open and are still firing.</param>
/// <param name="Closed">Items that were open but are no longer firing (their rule did not produce them this run).</param>
public sealed record ReconciliationResult(
    IReadOnlyList<OpenItem> Opened,
    IReadOnlyList<OpenItem> Kept,
    IReadOnlyList<OpenItem> Closed);

/// <summary>
/// Computes how the set of open stateful outcomes (holds, incidents, alerts) changes between the
/// previously-open set and the current run. Idempotent: the same inputs always yield the same result.
/// </summary>
public sealed class Reconciler
{
    /// <summary>The outcome types that represent persistent state subject to open/keep/close reconciliation.</summary>
    private static readonly HashSet<OutcomeType> StatefulTypes = new()
    {
        OutcomeType.CompleteHold,
        OutcomeType.PartialHold,
        OutcomeType.ComplianceAlert,
        OutcomeType.Warning,
        OutcomeType.CreateIncident,
        OutcomeType.CreateTask,
        OutcomeType.RouteToReview,
        OutcomeType.RouteToQueue,
        OutcomeType.Escalate,
    };

    /// <summary>Reconciles prior open items against the items produced this run.</summary>
    /// <param name="prior">The previously-open items.</param>
    /// <param name="current">The items produced this run.</param>
    /// <returns>The opened/kept/closed partition.</returns>
    public ReconciliationResult Reconcile(IEnumerable<OpenItem> prior, IEnumerable<OpenItem> current)
    {
        var priorList = prior.Where(i => StatefulTypes.Contains(i.Outcome.Type)).ToList();
        var currentList = current.Where(i => StatefulTypes.Contains(i.Outcome.Type)).ToList();

        var priorIds = priorList.Select(i => i.Identity).ToHashSet();
        var currentIds = currentList.Select(i => i.Identity).ToHashSet();

        var opened = currentList.Where(i => !priorIds.Contains(i.Identity)).ToList();
        var kept = currentList.Where(i => priorIds.Contains(i.Identity)).ToList();
        var closed = priorList.Where(i => !currentIds.Contains(i.Identity)).ToList();

        return new ReconciliationResult(opened, kept, closed);
    }

    /// <summary>
    /// Convenience overload that derives current items from an <see cref="EvaluationResult"/> trace,
    /// attributing each produced stateful outcome to its originating rule.
    /// </summary>
    /// <param name="prior">The previously-open items.</param>
    /// <param name="result">The evaluation result whose trace provides current items.</param>
    /// <returns>The opened/kept/closed partition.</returns>
    public ReconciliationResult Reconcile(IEnumerable<OpenItem> prior, EvaluationResult result)
        => Reconcile(prior, ToOpenItems(result.Trace));

    /// <summary>Extracts the stateful open items produced by a run from its decision trace.</summary>
    /// <param name="trace">The decision trace.</param>
    /// <returns>The open items, attributed to their originating rule.</returns>
    public static IReadOnlyList<OpenItem> ToOpenItems(IEnumerable<DecisionTrace> trace)
        => trace
            .Where(t => t.Produced is not null && StatefulTypes.Contains(t.Produced.Type))
            .Select(t => new OpenItem(t.RuleKey, t.Produced!))
            .ToList();
}
