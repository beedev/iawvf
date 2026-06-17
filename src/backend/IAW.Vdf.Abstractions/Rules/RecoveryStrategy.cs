namespace IAW.Vdf.Abstractions.Rules;

/// <summary>
/// A corrective action the engine attempts when a rule's <c>Assert</c> fails, before producing
/// <c>OnFailure</c>. If the strategy resolves (e.g. <c>apply-default</c> writes a fact), the assertion is
/// considered satisfied and the failure outcome is suppressed.
/// </summary>
public sealed class RecoveryStrategy
{
    /// <summary>The strategy identifier (e.g. <c>"find-alternate-specimen"</c>, <c>"apply-default"</c>).</summary>
    public required string Strategy { get; init; }

    /// <summary>Strategy parameters (e.g. <c>Target</c>, <c>Value</c> for apply-default).</summary>
    public IDictionary<string, object?> Parameters { get; init; } = new Dictionary<string, object?>(StringComparer.Ordinal);

    /// <summary>The well-known strategy name for applying a default value to a fact.</summary>
    public const string ApplyDefault = "apply-default";

    /// <summary>The well-known strategy name for searching the order for an acceptable alternate specimen.</summary>
    public const string FindAlternateSpecimen = "find-alternate-specimen";

    /// <summary>Builds an apply-default recovery strategy.</summary>
    /// <param name="target">The target fact path to populate.</param>
    /// <param name="value">A literal value to apply.</param>
    /// <param name="reference">A reference key whose resolved value to apply (takes precedence over <paramref name="value"/>).</param>
    /// <returns>A new recovery strategy.</returns>
    public static RecoveryStrategy ApplyDefaultStrategy(string target, object? value = null, string? reference = null)
        => new()
        {
            Strategy = ApplyDefault,
            Parameters = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["Target"] = target,
                ["Value"] = value,
                ["Reference"] = reference,
            },
        };
}
