using System.Text.Json;
using System.Text.Json.Serialization;
using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Core.Serialization;

/// <summary>
/// (De)serializes <see cref="RuleDefinition"/> instances to and from JSON, wiring the polymorphic
/// <see cref="ConditionJsonConverter"/> and the outcome / recovery converters so a rule — including its
/// full condition tree and parameterised outcomes — round-trips object → JSON → object losslessly.
/// </summary>
public static class RuleSerializer
{
    /// <summary>The shared, pre-configured serializer options.</summary>
    public static JsonSerializerOptions Options { get; } = CreateOptions();

    /// <summary>Creates a fresh options instance with all VDF converters registered.</summary>
    /// <returns>The serializer options.</returns>
    public static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            WriteIndented = true,
        };

        options.Converters.Add(new JsonStringEnumConverter());
        options.Converters.Add(new ConditionJsonConverter());
        options.Converters.Add(new OutcomeJsonConverter());
        options.Converters.Add(new RecoveryStrategyJsonConverter());
        return options;
    }

    /// <summary>Serializes a single rule.</summary>
    /// <param name="rule">The rule.</param>
    /// <returns>The JSON string.</returns>
    public static string Serialize(RuleDefinition rule) => JsonSerializer.Serialize(rule, Options);

    /// <summary>Serializes a collection of rules.</summary>
    /// <param name="rules">The rules.</param>
    /// <returns>The JSON array string.</returns>
    public static string SerializeMany(IEnumerable<RuleDefinition> rules) => JsonSerializer.Serialize(rules, Options);

    /// <summary>Deserializes a single rule.</summary>
    /// <param name="json">The JSON string.</param>
    /// <returns>The rule.</returns>
    /// <exception cref="JsonException">The JSON could not be deserialized.</exception>
    public static RuleDefinition Deserialize(string json)
        => JsonSerializer.Deserialize<RuleDefinition>(json, Options)
           ?? throw new JsonException("Failed to deserialize RuleDefinition.");

    /// <summary>Deserializes an array of rules.</summary>
    /// <param name="json">The JSON array string.</param>
    /// <returns>The rules.</returns>
    public static IReadOnlyList<RuleDefinition> DeserializeMany(string json)
        => JsonSerializer.Deserialize<List<RuleDefinition>>(json, Options) ?? new List<RuleDefinition>();
}
