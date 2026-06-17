namespace IAW.Vdf.Abstractions.Outcomes;

/// <summary>The semantic family an <see cref="OutcomeType"/> belongs to.</summary>
public enum OutcomeGroup
{
    /// <summary>No business effect (control flow only).</summary>
    None,

    /// <summary>Validation effects: holds, warnings, compliance alerts.</summary>
    Validation,

    /// <summary>Workflow effects: routing and escalation.</summary>
    Workflow,

    /// <summary>Derivation effects: fact computation and stamping.</summary>
    Derivation,

    /// <summary>Entity effects: creating placeholders, incidents, tasks.</summary>
    Entity,

    /// <summary>Control effects: preventing or allowing an action.</summary>
    Control,
}

/// <summary>The closed set of decision outcomes the engine can produce, mapped to an <see cref="OutcomeGroup"/>.</summary>
public enum OutcomeType
{
    /// <summary>Proceed; no effect.</summary>
    Continue,

    /// <summary>A failure was suppressed (e.g. recovery resolved it).</summary>
    Suppressed,

    /// <summary>Place a complete problem hold.</summary>
    CompleteHold,

    /// <summary>Place a partial problem hold.</summary>
    PartialHold,

    /// <summary>Raise a non-blocking warning.</summary>
    Warning,

    /// <summary>Raise a compliance alert (non-blocking).</summary>
    ComplianceAlert,

    /// <summary>Route the work item to a review queue.</summary>
    RouteToReview,

    /// <summary>Route the work item to a named queue.</summary>
    RouteToQueue,

    /// <summary>Escalate the work item.</summary>
    Escalate,

    /// <summary>Set a fact to an explicit value.</summary>
    SetValue,

    /// <summary>Apply a default value to a fact.</summary>
    ApplyDefault,

    /// <summary>Compute a fact value.</summary>
    CalculateValue,

    /// <summary>Create a placeholder entity (e.g. a specimen).</summary>
    CreatePlaceholder,

    /// <summary>Create an incident.</summary>
    CreateIncident,

    /// <summary>Create a task.</summary>
    CreateTask,

    /// <summary>Prevent a named action from proceeding.</summary>
    PreventAction,

    /// <summary>Explicitly allow a named action.</summary>
    AllowAction,
}
