using System.Text.Json;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Serialization;

namespace IAW.Vdf.Api.Infrastructure;

/// <summary>Helpers for turning request <see cref="JsonElement"/> rule payloads into typed definitions.</summary>
public static class RuleJsonHelper
{
    /// <summary>
    /// Validates that the supplied element is a JSON object and deserializes it into a
    /// <see cref="RuleDefinition"/> via the canonical <see cref="RuleSerializer"/>.
    /// </summary>
    /// <param name="element">The raw rule JSON element.</param>
    /// <param name="rule">The deserialized rule, when successful.</param>
    /// <param name="error">A human-readable parse error, when unsuccessful.</param>
    /// <returns><see langword="true"/> when the element is a valid rule object.</returns>
    public static bool TryParse(JsonElement element, out RuleDefinition? rule, out string? error)
    {
        rule = null;
        error = null;

        if (element.ValueKind != JsonValueKind.Object)
        {
            error = "ruleJson must be a JSON object.";
            return false;
        }

        try
        {
            rule = RuleSerializer.Deserialize(element.GetRawText());
            return true;
        }
        catch (Exception ex)
        {
            error = $"Invalid rule JSON: {ex.Message}";
            return false;
        }
    }
}
