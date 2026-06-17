using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Core.Serialization;

/// <summary>JSON converter for <see cref="RecoveryStrategy"/>, preserving primitive parameter values.</summary>
public sealed class RecoveryStrategyJsonConverter : JsonConverter<RecoveryStrategy>
{
    /// <inheritdoc />
    public override RecoveryStrategy Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var obj = JsonNode.Parse(ref reader)?.AsObject()
                  ?? throw new JsonException("RecoveryStrategy must be a JSON object.");

        var parameters = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (obj["parameters"] is JsonObject p)
        {
            foreach (var kvp in p)
            {
                parameters[kvp.Key] = ParameterSerialization.FromNode(kvp.Value);
            }
        }

        return new RecoveryStrategy
        {
            Strategy = obj["strategy"]?.GetValue<string>()
                       ?? throw new JsonException("RecoveryStrategy requires 'strategy'."),
            Parameters = parameters,
        };
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, RecoveryStrategy value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("strategy", value.Strategy);
        if (value.Parameters.Count > 0)
        {
            writer.WritePropertyName("parameters");
            ParameterSerialization.WriteMap(writer, value.Parameters);
        }

        writer.WriteEndObject();
    }
}
