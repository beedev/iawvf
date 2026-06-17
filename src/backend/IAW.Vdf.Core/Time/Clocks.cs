using IAW.Vdf.Abstractions.Time;

namespace IAW.Vdf.Core.Time;

/// <summary>An <see cref="IClock"/> backed by the system wall clock (UTC).</summary>
public sealed class SystemClock : IClock
{
    /// <inheritdoc />
    public DateTimeOffset Now => DateTimeOffset.UtcNow;
}

/// <summary>An <see cref="IClock"/> pinned to a fixed instant, for deterministic tests.</summary>
public sealed class FixedClock : IClock
{
    /// <summary>Creates a clock fixed at the supplied instant.</summary>
    /// <param name="now">The fixed instant.</param>
    public FixedClock(DateTimeOffset now) => Now = now;

    /// <inheritdoc />
    public DateTimeOffset Now { get; }
}
