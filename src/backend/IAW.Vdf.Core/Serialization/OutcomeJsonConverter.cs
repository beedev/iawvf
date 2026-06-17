using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using IAW.Vdf.Abstractions.Outcomes;

namespace IAW.Vdf.Core.Serialization;

/// <summary>
/// JSON converter for <see cref="Outcome"/>. Serializes the type, scope, reason, severity, and the
/// parameter map (with primitive object values preserved). <c>Group</c> is omitted on write (it is
/// derived from <c>Type</c>) and recomputed on read.
/// </summary>
public sealed class OutcomeJsonConverter : JsonConverter<Outcome>
{
    /// <inheritdoc />
    public override Outcome Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var obj = JsonNode.Parse(ref reader)?.AsObject()
                  ?? throw new JsonException("Outcome must be a JSON object.");

        var type = Enum.TryParse<OutcomeType>(obj["type"]?.GetValue<string>(), ignoreCase: true, out var t)
            ? t
            : throw new JsonException("Outcome requires a valid 'type'.");

        var parameters = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (obj["parameters"] is JsonObject p)
        {
            foreach (var kvp in p)
            {
                parameters[kvp.Key] = ParameterSerialization.FromNode(kvp.Value);
            }
        }

        return new Outcome
        {
            Type = type,
            Scope = obj["scope"]?.GetValue<string>(),
            Reason = obj["reason"]?.GetValue<string>(),
            Severity = obj["severity"]?.GetValue<string>(),
            Parameters = parameters,
        };
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, Outcome value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("type", value.Type.ToString());
        if (value.Scope is not null)
        {
            writer.WriteString("scope", value.Scope);
        }

        if (value.Reason is not null)
        {
            writer.WriteString("reason", value.Reason);
        }

        if (value.Severity is not null)
        {
            writer.WriteString("severity", value.Severity);
        }

        if (value.Parameters.Count > 0)
        {
            writer.WritePropertyName("parameters");
            ParameterSerialization.WriteMap(writer, value.Parameters);
        }

        writer.WriteEndObject();
    }
}
