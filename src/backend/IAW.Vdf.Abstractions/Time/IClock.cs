namespace IAW.Vdf.Abstractions.Time;

/// <summary>Abstracts the current time so evaluation is deterministic and testable.</summary>
public interface IClock
{
    /// <summary>The current instant.</summary>
    DateTimeOffset Now { get; }
}
