namespace IAW.Vdf.Abstractions.Triggers;

/// <summary>The category of event that initiates a rule-evaluation run.</summary>
public enum TriggerType
{
    /// <summary>An order lifecycle event (created, updated, submitted, ...).</summary>
    OrderEvent,

    /// <summary>A scheduled time-based trigger.</summary>
    TimeSchedule,

    /// <summary>A decision returned from a downstream system or human reviewer.</summary>
    DecisionReturned,
}

/// <summary>Describes what initiated an evaluation run, with optional event name and context.</summary>
public sealed class Trigger
{
    /// <summary>The trigger category.</summary>
    public required TriggerType Type { get; init; }

    /// <summary>An optional specific event name (e.g. <c>"OrderSubmitted"</c>).</summary>
    public string? EventName { get; init; }

    /// <summary>Arbitrary contextual data accompanying the trigger.</summary>
    public IDictionary<string, object?> Context { get; init; } = new Dictionary<string, object?>(StringComparer.Ordinal);

    /// <summary>Convenience factory for an order-event trigger.</summary>
    /// <param name="eventName">The event name.</param>
    /// <returns>A new trigger.</returns>
    public static Trigger OrderEvent(string eventName)
        => new() { Type = TriggerType.OrderEvent, EventName = eventName };
}
