using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Authoring.Paraphrase;

/// <summary>
/// Produces deterministic, human-readable English sentences from a <see cref="RuleDefinition"/>.
/// The output is stable: calling <see cref="Paraphrase"/> twice with the same input always yields
/// the same string.
/// </summary>
public sealed class RoundTripParaphraser
{
    /// <summary>
    /// Converts a <see cref="RuleDefinition"/> to a descriptive English sentence.
    /// </summary>
    /// <param name="rule">The rule to paraphrase.</param>
    /// <returns>A deterministic English description of the rule's semantics.</returns>
    public string Paraphrase(RuleDefinition rule)
    {
        // Derivation rules have no Assert — they produce an outcome based on AppliesWhen alone.
        if (rule.Assert is null)
        {
            // "When {appliesWhen}, {outcome}."
            // or for no appliesWhen: "Always: {outcome}."
            if (rule.AppliesWhen is not null)
            {
                var when = RenderCondition(rule.AppliesWhen);
                var outcome = RenderOutcome(rule.OnFailure);
                return $"When {when}, {outcome}.";
            }
            else
            {
                var outcome = RenderOutcome(rule.OnFailure);
                return $"Always: {outcome}.";
            }
        }

        // Validation / Route rules have an Assert.
        var assertPhrase = RenderCondition(rule.Assert);

        if (rule.AppliesWhen is not null)
        {
            var whenPhrase = RenderCondition(rule.AppliesWhen);
            var recoveryPhrase = rule.Recover is not null
                ? RenderRecovery(rule.Recover) + "; if unresolved, "
                : "";
            var failurePhrase = RenderOutcome(rule.OnFailure);

            return $"For orders where {whenPhrase}, require {assertPhrase} to be present; if absent, {recoveryPhrase}{failurePhrase}.";
        }
        else
        {
            var recoveryPhrase = rule.Recover is not null
                ? RenderRecovery(rule.Recover) + ". If unresolved, "
                : "";
            var failurePhrase = RenderOutcome(rule.OnFailure);

            return $"Require {assertPhrase} to be present; {recoveryPhrase}{failurePhrase}.";
        }
    }

    // ── Condition rendering ──────────────────────────────────────────────────────────────────────

    private static string RenderCondition(ICondition condition) =>
        condition switch
        {
            LeafCondition leaf => RenderLeaf(leaf),
            GroupCondition group => RenderGroup(group),
            _ => condition.ToString() ?? "unknown condition"
        };

    private static string RenderLeaf(LeafCondition leaf)
    {
        var subject = leaf.Subject;
        var prefix = leaf.Quantifier switch
        {
            Quantifier.Any => $"any {subject}",
            Quantifier.Every => $"every {subject}",
            _ => subject
        };

        return leaf.Operator switch
        {
            OperatorKind.IsPresent => $"{prefix} is present",
            OperatorKind.IsAbsent => $"{prefix} is absent",
            OperatorKind.Equals => $"{prefix} equals {RenderValue(leaf)}",
            OperatorKind.NotEquals => $"{prefix} does not equal {RenderValue(leaf)}",
            OperatorKind.InSet => $"{prefix} is in {RenderRef(leaf)}",
            OperatorKind.NotInSet => $"{prefix} is not in {RenderRef(leaf)}",
            OperatorKind.GreaterThan => $"{prefix} is greater than {RenderRef(leaf)}",
            OperatorKind.LessThan => $"{prefix} is less than {RenderRef(leaf)}",
            OperatorKind.GreaterOrEqual => $"{prefix} is greater than or equal to {RenderRef(leaf)}",
            OperatorKind.LessOrEqual => $"{prefix} is less than or equal to {RenderRef(leaf)}",
            OperatorKind.WithinRange => $"{prefix} is within range {RenderRef(leaf)}",
            OperatorKind.Matches => $"{prefix} matches {RenderRef(leaf)}",
            OperatorKind.IsCompatibleWith => $"{prefix} is compatible with {RenderRef(leaf)}",
            OperatorKind.IsEligibleFor => $"{prefix} is eligible for {RenderRef(leaf)}",
            OperatorKind.Exists => $"{prefix} exists",
            _ => $"{prefix} {leaf.Operator} {RenderValue(leaf)}"
        };
    }

    private static string RenderGroup(GroupCondition group)
    {
        var children = group.Conditions.Select(RenderCondition).ToList();
        return group.LogicalOp switch
        {
            LogicalOperator.All => string.Join(" and ", children),
            LogicalOperator.Any => string.Join(" or ", children),
            LogicalOperator.Not when children.Count == 1 => $"not ({children[0]})",
            _ => $"({string.Join(", ", children)})"
        };
    }

    private static string RenderValue(LeafCondition leaf)
    {
        if (leaf.Value is not null)
            return leaf.Value.ToJsonString().Trim('"');
        if (leaf.Reference is not null)
            return leaf.Reference;
        return "null";
    }

    private static string RenderRef(LeafCondition leaf) =>
        leaf.Reference ?? (leaf.Value is not null ? leaf.Value.ToJsonString().Trim('"') : "null");

    // ── Outcome rendering ───────────────────────────────────────────────────────────────────────

    private static string RenderOutcome(Outcome outcome)
    {
        var scope = outcome.Scope ?? "order";
        var reason = outcome.Reason;
        var reasonSuffix = !string.IsNullOrWhiteSpace(reason) ? $": {reason}" : "";

        return outcome.Type switch
        {
            OutcomeType.Continue => "proceed",
            OutcomeType.Suppressed => "suppress the hold (resolved by recovery)",

            OutcomeType.CompleteHold =>
                $"place a complete problem hold on the {scope}{reasonSuffix}",

            OutcomeType.PartialHold =>
                $"place a partial hold on the {scope}{reasonSuffix}",

            OutcomeType.Warning =>
                $"raise a warning on the {scope}{reasonSuffix}",

            OutcomeType.ComplianceAlert =>
                BuildComplianceAlert(outcome),

            OutcomeType.RouteToReview =>
                BuildRouteToReview(outcome),

            OutcomeType.RouteToQueue =>
                BuildRouteToQueue(outcome),

            OutcomeType.Escalate =>
                $"escalate the {scope}{reasonSuffix}",

            OutcomeType.SetValue =>
                BuildSetValue(outcome),

            OutcomeType.ApplyDefault =>
                BuildApplyDefault(outcome),

            OutcomeType.CalculateValue =>
                BuildCalculateValue(outcome),

            OutcomeType.CreatePlaceholder =>
                BuildCreatePlaceholder(outcome),

            OutcomeType.CreateIncident =>
                $"create an incident for the {scope}{reasonSuffix}",

            OutcomeType.CreateTask =>
                $"create a task for the {scope}{reasonSuffix}",

            OutcomeType.PreventAction =>
                BuildPreventAction(outcome),

            OutcomeType.AllowAction =>
                BuildAllowAction(outcome),

            _ => outcome.Type.ToString()
        };
    }

    private static string BuildComplianceAlert(Outcome outcome)
    {
        var scope = outcome.Scope ?? "order";
        var severity = outcome.Severity;
        var article = string.Equals(severity, "informational", StringComparison.OrdinalIgnoreCase)
            ? "an informational"
            : "a";
        return $"raise {article} compliance alert on the {scope}";
    }

    private static string BuildRouteToReview(Outcome outcome)
    {
        var scope = outcome.Scope ?? "order";
        outcome.Parameters.TryGetValue("Destination", out var dest);
        var destination = dest?.ToString() ?? "review queue";
        return $"route the {scope} to {destination} for review";
    }

    private static string BuildRouteToQueue(Outcome outcome)
    {
        var scope = outcome.Scope ?? "order";
        outcome.Parameters.TryGetValue("Queue", out var queue);
        var queueName = queue?.ToString() ?? "queue";
        return $"route the {scope} to {queueName}";
    }

    private static string BuildSetValue(Outcome outcome)
    {
        outcome.Parameters.TryGetValue("Target", out var target);
        outcome.Parameters.TryGetValue("Value", out var value);
        return $"set {target ?? "target"} to '{value ?? "value"}'";
    }

    private static string BuildApplyDefault(Outcome outcome)
    {
        outcome.Parameters.TryGetValue("Target", out var target);
        return $"apply the default value to {target ?? "target"}";
    }

    private static string BuildCalculateValue(Outcome outcome)
    {
        outcome.Parameters.TryGetValue("Target", out var target);
        return $"calculate the value for {target ?? "target"}";
    }

    private static string BuildCreatePlaceholder(Outcome outcome)
    {
        outcome.Parameters.TryGetValue("SpecimenType", out var specimenType);
        return $"create a placeholder {specimenType ?? "specimen"} specimen";
    }

    private static string BuildPreventAction(Outcome outcome)
    {
        outcome.Parameters.TryGetValue("Action", out var action);
        return $"prevent the '{action ?? "action"}' action";
    }

    private static string BuildAllowAction(Outcome outcome)
    {
        outcome.Parameters.TryGetValue("Action", out var action);
        return $"allow the '{action ?? "action"}' action";
    }

    // ── Recovery rendering ──────────────────────────────────────────────────────────────────────

    private static string RenderRecovery(RecoveryStrategy recover)
    {
        if (string.Equals(recover.Strategy, RecoveryStrategy.ApplyDefault, StringComparison.OrdinalIgnoreCase))
        {
            recover.Parameters.TryGetValue("Target", out var target);
            recover.Parameters.TryGetValue("Reference", out var reference);
            var targetStr = target?.ToString() ?? "target";
            var refStr = reference?.ToString() ?? "reference";
            return $"first attempt to apply default value to {targetStr} from {refStr}";
        }

        if (string.Equals(recover.Strategy, RecoveryStrategy.FindAlternateSpecimen, StringComparison.OrdinalIgnoreCase))
        {
            return "first search for an alternate compatible specimen";
        }

        return $"first attempt recovery via '{recover.Strategy}'";
    }
}
