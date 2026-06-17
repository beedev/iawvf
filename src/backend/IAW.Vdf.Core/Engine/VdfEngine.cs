using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Time;
using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Core.Engine;

/// <summary>
/// The deterministic rule engine and <see cref="IRuleEvaluator"/> façade. Orchestrates rule selection,
/// per-rule evaluation of the four-part anatomy (AppliesWhen / Assert / OnSuccess / OnFailure) with
/// recovery, rule chaining (derived facts feed later phases), outcome dispatch, and full tracing.
/// </summary>
/// <remarks>
/// Determinism: the same request evaluated twice produces identical outcomes and (modulo timestamps)
/// identical traces. The working fact document is cloned from the request so the caller's facts are
/// never mutated; all derivations are written into that clone and returned as <c>FactsAfter</c>.
/// </remarks>
public sealed class VdfEngine : IRuleEvaluator
{
    private readonly IRuleRepository _repository;
    private readonly IReferenceDataProvider _references;
    private readonly RuleSelector _selector;
    private readonly IClock _clock;
    private readonly IReadOnlyList<IOutcomeHandler> _handlers;

    /// <summary>Creates the engine.</summary>
    /// <param name="repository">The rule repository.</param>
    /// <param name="references">The reference-data provider.</param>
    /// <param name="selector">The rule selector.</param>
    /// <param name="clock">The clock (used for trace timestamps).</param>
    /// <param name="handlers">The outcome handlers to dispatch produced outcomes to.</param>
    public VdfEngine(
        IRuleRepository repository,
        IReferenceDataProvider references,
        RuleSelector selector,
        IClock clock,
        IEnumerable<IOutcomeHandler>? handlers = null)
    {
        _repository = repository;
        _references = references;
        _selector = selector;
        _clock = clock;
        _handlers = handlers?.ToList() ?? new List<IOutcomeHandler>();
    }

    /// <inheritdoc />
    public async Task<EvaluationResult> EvaluateAsync(EvaluationRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // 1. Work on an isolated copy so the caller's facts are never mutated (and so the run is repeatable).
        var facts = request.Facts.Clone();

        // 2. Select applicable rules deterministically.
        var candidates = await _repository.GetActiveRulesAsync(request.AsOf, request.RuleSet, cancellationToken).ConfigureAwait(false);
        var ordered = _selector.Select(candidates, request.AsOf);

        var outcomes = new List<Outcome>();
        var traces = new List<DecisionTrace>();

        // 3. Evaluate each rule in phase/priority/key order. Derivations write back into 'facts'
        //    so later-phase rules observe them (rule chaining).
        foreach (var rule in ordered)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var (trace, produced) = EvaluateRule(rule, facts, request);
            traces.Add(trace);
            if (produced is not null)
            {
                outcomes.Add(produced);
            }
        }

        // 5. Dispatch outcomes to matching handlers.
        var context = new EvaluationContext { Trigger = request.Trigger, Facts = facts, AsOf = request.AsOf };
        foreach (var outcome in outcomes)
        {
            foreach (var handler in _handlers.Where(h => h.CanHandle(outcome.Type)))
            {
                await handler.HandleAsync(outcome, context, cancellationToken).ConfigureAwait(false);
            }
        }

        // 6. Return outcomes + full traces + derived facts.
        return new EvaluationResult
        {
            Outcomes = outcomes,
            Trace = traces,
            FactsAfter = facts,
        };
    }

    private (DecisionTrace Trace, Outcome? Produced) EvaluateRule(RuleDefinition rule, FactDocument facts, EvaluationRequest request)
    {
        var conditionSink = new ConditionTraceSink();
        var evaluatedAt = _clock.Now;

        // WHEN: applicability gate. Null/empty AppliesWhen means "always applies".
        var applies = rule.AppliesWhen is null || rule.AppliesWhen.Evaluate(facts, _references, conditionSink);
        if (!applies)
        {
            return (BuildTrace(rule, conditionSink, evaluatedAt, applied: false, assertResult: null,
                recoveryAttempted: false, recoveryResolved: false, produced: null), null);
        }

        // DECISION: a null Assert is treated as failing through to OnFailure (derivation rules rely on this).
        var assertResult = rule.Assert is not null && rule.Assert.Evaluate(facts, _references, conditionSink);

        if (assertResult)
        {
            var success = rule.OnSuccess;
            ApplyDerivationIfAny(success, facts);
            return (BuildTrace(rule, conditionSink, evaluatedAt, applied: true, assertResult: true,
                recoveryAttempted: false, recoveryResolved: false, produced: success), success);
        }

        // Assertion failed (or absent): attempt recovery before producing OnFailure.
        var recoveryAttempted = false;
        var recoveryResolved = false;

        if (rule.Recover is not null)
        {
            recoveryAttempted = true;
            recoveryResolved = TryRecover(rule.Recover, facts);

            if (recoveryResolved)
            {
                // Recovery satisfied the intent; suppress OnFailure unless the author explicitly defined Suppressed.
                var suppressed = rule.OnFailure.Type == OutcomeType.Suppressed
                    ? rule.OnFailure
                    : Outcome.Suppressed(rule.OnFailure.Reason ?? "Resolved by recovery");

                return (BuildTrace(rule, conditionSink, evaluatedAt, applied: true, assertResult: false,
                    recoveryAttempted: true, recoveryResolved: true, produced: suppressed), suppressed);
            }
        }

        // No recovery, or recovery did not resolve: produce OnFailure (which may itself be a derivation).
        var failure = rule.OnFailure;
        ApplyDerivationIfAny(failure, facts);
        return (BuildTrace(rule, conditionSink, evaluatedAt, applied: true, assertResult: false,
            recoveryAttempted: recoveryAttempted, recoveryResolved: false, produced: failure), failure);
    }

    /// <summary>Writes a derivation outcome's target fact back into the working document (rule chaining).</summary>
    private static void ApplyDerivationIfAny(Outcome outcome, FactDocument facts)
    {
        if (outcome.Group != OutcomeGroup.Derivation)
        {
            return;
        }

        if (outcome.Parameters.TryGetValue("Target", out var target) && target is string path)
        {
            outcome.Parameters.TryGetValue("Value", out var value);
            facts.Set(path, ToNode(value));
        }
    }

    /// <summary>Attempts a recovery strategy. Returns true if it resolved the failure (e.g. a fact was written).</summary>
    private bool TryRecover(Abstractions.Rules.RecoveryStrategy recovery, FactDocument facts)
    {
        switch (recovery.Strategy)
        {
            case Abstractions.Rules.RecoveryStrategy.ApplyDefault:
                if (!recovery.Parameters.TryGetValue("Target", out var target) || target is not string path)
                {
                    return false;
                }

                JsonNode? value = null;
                if (recovery.Parameters.TryGetValue("Reference", out var refKey) && refKey is string key)
                {
                    value = _references.Resolve(key);
                }

                if (value is null && recovery.Parameters.TryGetValue("Value", out var literal))
                {
                    value = ToNode(literal);
                }

                if (value is null)
                {
                    return false;
                }

                facts.Set(path, value);
                return true;

            case Abstractions.Rules.RecoveryStrategy.FindAlternateSpecimen:
                // M0 stub: the host-specific search is not implemented; treated as unresolved so OnFailure fires.
                return false;

            default:
                return false;
        }
    }

    private static DecisionTrace BuildTrace(
        RuleDefinition rule,
        ConditionTraceSink sink,
        DateTimeOffset evaluatedAt,
        bool applied,
        bool? assertResult,
        bool recoveryAttempted,
        bool recoveryResolved,
        Outcome? produced)
    {
        var factsRead = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var c in sink.Entries)
        {
            factsRead[c.Subject] = c.ResolvedLeft;
        }

        return new DecisionTrace
        {
            RuleKey = rule.Key,
            Version = rule.Version,
            Phase = rule.Phase,
            Applied = applied,
            AssertResult = applied ? assertResult : null,
            Conditions = sink.Entries.ToList(),
            RecoveryAttempted = recoveryAttempted,
            RecoveryResolved = recoveryResolved,
            Produced = produced,
            FactsRead = factsRead,
            EvaluatedAt = evaluatedAt,
        };
    }

    private static JsonNode? ToNode(object? value) => value switch
    {
        null => null,
        JsonNode node => JsonNode.Parse(node.ToJsonString()),
        string s => JsonValue.Create(s),
        bool b => JsonValue.Create(b),
        int i => JsonValue.Create(i),
        long l => JsonValue.Create(l),
        double d => JsonValue.Create(d),
        decimal m => JsonValue.Create(m),
        _ => JsonValue.Create(value.ToString()),
    };
}
