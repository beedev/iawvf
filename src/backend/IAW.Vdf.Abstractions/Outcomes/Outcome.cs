using System.Text.Json.Serialization;

namespace IAW.Vdf.Abstractions.Outcomes;

/// <summary>
/// The effect a rule produces. The <see cref="Group"/> is derived deterministically from <see cref="Type"/>.
/// Effect-specific data (target fact, value, destination queue, action name, specimen type, etc.) is carried
/// in <see cref="Parameters"/>. Use the static factory helpers for clear, well-formed outcomes.
/// </summary>
public sealed class Outcome
{
    /// <summary>The outcome type.</summary>
    public required OutcomeType Type { get; init; }

    /// <summary>The semantic group, derived from <see cref="Type"/>.</summary>
    [JsonIgnore]
    public OutcomeGroup Group => GroupFor(Type);

    /// <summary>The scope the outcome targets: <c>"order"</c>, <c>"test"</c>, or <c>"specimen"</c>.</summary>
    public string? Scope { get; init; }

    /// <summary>A human-readable reason / explanation.</summary>
    public string? Reason { get; init; }

    /// <summary>An optional severity (e.g. <c>"informational"</c>).</summary>
    public string? Severity { get; init; }

    /// <summary>Effect-specific parameters (Target, Value, Destination, Action, SpecimenType, ...).</summary>
    public IDictionary<string, object?> Parameters { get; init; } = new Dictionary<string, object?>(StringComparer.Ordinal);

    /// <summary>Maps an <see cref="OutcomeType"/> to its <see cref="OutcomeGroup"/>.</summary>
    /// <param name="type">The outcome type.</param>
    /// <returns>The owning group.</returns>
    public static OutcomeGroup GroupFor(OutcomeType type) => type switch
    {
        OutcomeType.Continue or OutcomeType.Suppressed => OutcomeGroup.None,
        OutcomeType.CompleteHold or OutcomeType.PartialHold or OutcomeType.Warning or OutcomeType.ComplianceAlert => OutcomeGroup.Validation,
        OutcomeType.RouteToReview or OutcomeType.RouteToQueue or OutcomeType.Escalate => OutcomeGroup.Workflow,
        OutcomeType.SetValue or OutcomeType.ApplyDefault or OutcomeType.CalculateValue => OutcomeGroup.Derivation,
        OutcomeType.CreatePlaceholder or OutcomeType.CreateIncident or OutcomeType.CreateTask => OutcomeGroup.Entity,
        OutcomeType.PreventAction or OutcomeType.AllowAction => OutcomeGroup.Control,
        _ => OutcomeGroup.None,
    };

    // --- Control / None ---

    /// <summary>Proceed with no effect.</summary>
    /// <returns>A Continue outcome.</returns>
    public static Outcome Continue() => new() { Type = OutcomeType.Continue };

    /// <summary>A suppressed failure (e.g. recovery resolved the assertion).</summary>
    /// <param name="reason">Optional explanation.</param>
    /// <returns>A Suppressed outcome.</returns>
    public static Outcome Suppressed(string? reason = null) => new() { Type = OutcomeType.Suppressed, Reason = reason };

    // --- Validation ---

    /// <summary>A complete problem hold.</summary>
    /// <param name="scope">The hold scope.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A CompleteHold outcome.</returns>
    public static Outcome CompleteHold(string scope, string? reason = null)
        => new() { Type = OutcomeType.CompleteHold, Scope = scope, Reason = reason };

    /// <summary>A partial problem hold.</summary>
    /// <param name="scope">The hold scope.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A PartialHold outcome.</returns>
    public static Outcome PartialHold(string scope, string? reason = null)
        => new() { Type = OutcomeType.PartialHold, Scope = scope, Reason = reason };

    /// <summary>A non-blocking warning.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A Warning outcome.</returns>
    public static Outcome Warning(string scope, string? reason = null)
        => new() { Type = OutcomeType.Warning, Scope = scope, Reason = reason };

    /// <summary>A compliance alert.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="reason">The reason.</param>
    /// <param name="severity">The severity (e.g. <c>"informational"</c>).</param>
    /// <returns>A ComplianceAlert outcome.</returns>
    public static Outcome ComplianceAlert(string scope, string? reason = null, string? severity = null)
        => new() { Type = OutcomeType.ComplianceAlert, Scope = scope, Reason = reason, Severity = severity };

    // --- Workflow ---

    /// <summary>Route to a review destination.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="destination">The review destination.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A RouteToReview outcome.</returns>
    public static Outcome RouteToReview(string scope, string destination, string? reason = null)
        => new()
        {
            Type = OutcomeType.RouteToReview,
            Scope = scope,
            Reason = reason,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal) { ["Destination"] = destination },
        };

    /// <summary>Route to a named queue.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="destination">The queue name.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A RouteToQueue outcome.</returns>
    public static Outcome RouteToQueue(string scope, string destination, string? reason = null)
        => new()
        {
            Type = OutcomeType.RouteToQueue,
            Scope = scope,
            Reason = reason,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal) { ["Destination"] = destination },
        };

    /// <summary>Escalate the work item.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>An Escalate outcome.</returns>
    public static Outcome Escalate(string scope, string? reason = null)
        => new() { Type = OutcomeType.Escalate, Scope = scope, Reason = reason };

    // --- Derivation ---

    /// <summary>Apply a default value to a target fact.</summary>
    /// <param name="target">The target fact path.</param>
    /// <param name="value">The value to apply.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>An ApplyDefault outcome.</returns>
    public static Outcome ApplyDefault(string target, object? value, string? reason = null)
        => Derivation(OutcomeType.ApplyDefault, target, value, reason);

    /// <summary>Set a target fact to an explicit value.</summary>
    /// <param name="target">The target fact path.</param>
    /// <param name="value">The value to set.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A SetValue outcome.</returns>
    public static Outcome SetValue(string target, object? value, string? reason = null)
        => Derivation(OutcomeType.SetValue, target, value, reason);

    /// <summary>Derive (stamp) a target fact value. Modelled as <see cref="OutcomeType.SetValue"/>.</summary>
    /// <param name="target">The target fact path.</param>
    /// <param name="value">The value to derive.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A SetValue outcome representing a derivation.</returns>
    public static Outcome DeriveValue(string target, object? value, string? reason = null)
        => Derivation(OutcomeType.SetValue, target, value, reason);

    /// <summary>Compute a target fact value.</summary>
    /// <param name="target">The target fact path.</param>
    /// <param name="value">The computed value (or expression descriptor).</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A CalculateValue outcome.</returns>
    public static Outcome CalculateValue(string target, object? value, string? reason = null)
        => Derivation(OutcomeType.CalculateValue, target, value, reason);

    private static Outcome Derivation(OutcomeType type, string target, object? value, string? reason)
        => new()
        {
            Type = type,
            Reason = reason,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal) { ["Target"] = target, ["Value"] = value },
        };

    // --- Entity ---

    /// <summary>Create a placeholder specimen of the given type.</summary>
    /// <param name="specimenType">The specimen type to create.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A CreatePlaceholder outcome.</returns>
    public static Outcome CreatePlaceholderSpecimen(string specimenType, string? reason = null)
        => new()
        {
            Type = OutcomeType.CreatePlaceholder,
            Scope = "specimen",
            Reason = reason,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal) { ["SpecimenType"] = specimenType },
        };

    /// <summary>Create an incident.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A CreateIncident outcome.</returns>
    public static Outcome CreateIncident(string scope, string? reason = null)
        => new() { Type = OutcomeType.CreateIncident, Scope = scope, Reason = reason };

    /// <summary>Create a task.</summary>
    /// <param name="scope">The scope.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A CreateTask outcome.</returns>
    public static Outcome CreateTask(string scope, string? reason = null)
        => new() { Type = OutcomeType.CreateTask, Scope = scope, Reason = reason };

    // --- Control ---

    /// <summary>Prevent a named action from proceeding.</summary>
    /// <param name="action">The action to prevent.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>A PreventAction outcome.</returns>
    public static Outcome PreventAction(string action, string? reason = null)
        => new()
        {
            Type = OutcomeType.PreventAction,
            Reason = reason,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal) { ["Action"] = action },
        };

    /// <summary>Explicitly allow a named action.</summary>
    /// <param name="action">The action to allow.</param>
    /// <param name="reason">The reason.</param>
    /// <returns>An AllowAction outcome.</returns>
    public static Outcome AllowAction(string action, string? reason = null)
        => new()
        {
            Type = OutcomeType.AllowAction,
            Reason = reason,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal) { ["Action"] = action },
        };
}
