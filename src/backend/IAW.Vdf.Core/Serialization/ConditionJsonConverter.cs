using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using IAW.Vdf.Abstractions.Conditions;

namespace IAW.Vdf.Core.Serialization;

/// <summary>
/// Polymorphic JSON converter for <see cref="ICondition"/>. A discriminator property <c>"type"</c> with
/// value <c>"leaf"</c> or <c>"group"</c> selects the concrete shape:
/// <list type="bullet">
///   <item><c>{ "type":"leaf", "subject":"...", "operator":"...", "value":..., "reference":"...", "quantifier":"..." }</c></item>
///   <item><c>{ "type":"group", "logicalOp":"All|Any|Not", "conditions":[ ... ] }</c></item>
/// </list>
/// This lets an entire rule's boolean tree round-trip object → JSON → object losslessly.
/// </summary>
public sealed class ConditionJsonConverter : JsonConverter<ICondition>
{
    /// <inheritdoc />
    public override ICondition? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var node = JsonNode.Parse(ref reader);
        return node is null ? null : ReadNode(node);
    }

    private static ICondition ReadNode(JsonNode node)
    {
        var obj = node.AsObject();
        var type = obj["type"]?.GetValue<string>()?.ToLowerInvariant()
                   ?? throw new JsonException("Condition is missing the 'type' discriminator.");

        switch (type)
        {
            case "leaf":
                return new LeafCondition
                {
                    Subject = obj["subject"]?.GetValue<string>()
                              ?? throw new JsonException("Leaf condition requires 'subject'."),
                    Operator = ParseEnum<OperatorKind>(obj["operator"]?.GetValue<string>()
                              ?? throw new JsonException("Leaf condition requires 'operator'.")),
                    Value = obj["value"] is { } v ? JsonNode.Parse(v.ToJsonString()) : null,
                    Reference = obj["reference"]?.GetValue<string>(),
                    Quantifier = obj["quantifier"] is { } q
                        ? ParseEnum<Quantifier>(q.GetValue<string>())
                        : Quantifier.This,
                };

            case "group":
                var logical = ParseEnum<LogicalOperator>(obj["logicalOp"]?.GetValue<string>()
                              ?? throw new JsonException("Group condition requires 'logicalOp'."));
                var children = new List<ICondition>();
                if (obj["conditions"] is JsonArray arr)
                {
                    foreach (var child in arr)
                    {
                        if (child is not null)
                        {
                            children.Add(ReadNode(child));
                        }
                    }
                }

                return new GroupCondition { LogicalOp = logical, Conditions = children };

            default:
                throw new JsonException($"Unknown condition type '{type}'.");
        }
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, ICondition value, JsonSerializerOptions options)
    {
        switch (value)
        {
            case LeafCondition leaf:
                writer.WriteStartObject();
                writer.WriteString("type", "leaf");
                writer.WriteString("subject", leaf.Subject);
                writer.WriteString("operator", leaf.Operator.ToString());
                if (leaf.Value is not null)
                {
                    writer.WritePropertyName("value");
                    leaf.Value.WriteTo(writer);
                }

                if (leaf.Reference is not null)
                {
                    writer.WriteString("reference", leaf.Reference);
                }

                if (leaf.Quantifier != Quantifier.This)
                {
                    writer.WriteString("quantifier", leaf.Quantifier.ToString());
                }

                writer.WriteEndObject();
                break;

            case GroupCondition group:
                writer.WriteStartObject();
                writer.WriteString("type", "group");
                writer.WriteString("logicalOp", group.LogicalOp.ToString());
                writer.WritePropertyName("conditions");
                writer.WriteStartArray();
                foreach (var child in group.Conditions)
                {
                    Write(writer, child, options);
                }

                writer.WriteEndArray();
                writer.WriteEndObject();
                break;

            default:
                throw new JsonException($"Unsupported condition type '{value.GetType().Name}'.");
        }
    }

    private static T ParseEnum<T>(string raw) where T : struct, Enum
        => Enum.TryParse<T>(raw, ignoreCase: true, out var parsed)
            ? parsed
            : throw new JsonException($"'{raw}' is not a valid {typeof(T).Name}.");
}
