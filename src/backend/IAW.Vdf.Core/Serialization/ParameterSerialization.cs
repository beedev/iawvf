using System.Text.Json;
using System.Text.Json.Nodes;

namespace IAW.Vdf.Core.Serialization;

/// <summary>
/// Helpers for (de)serializing the <c>object?</c> parameter maps used by outcomes and recovery
/// strategies. Primitive values (string, bool, number) are preserved as CLR types so engine logic that
/// reads them (e.g. derivation Target/Value) behaves identically before and after a round-trip.
/// </summary>
internal static class ParameterSerialization
{
    /// <summary>Writes an <c>object?</c> parameter map as a JSON object.</summary>
    /// <param name="writer">The writer.</param>
    /// <param name="map">The parameter map.</param>
    public static void WriteMap(Utf8JsonWriter writer, IDictionary<string, object?> map)
    {
        writer.WriteStartObject();
        foreach (var kvp in map)
        {
            writer.WritePropertyName(kvp.Key);
            WriteValue(writer, kvp.Value);
        }

        writer.WriteEndObject();
    }

    private static void WriteValue(Utf8JsonWriter writer, object? value)
    {
        switch (value)
        {
            case null:
                writer.WriteNullValue();
                break;
            case string s:
                writer.WriteStringValue(s);
                break;
            case bool b:
                writer.WriteBooleanValue(b);
                break;
            case int i:
                writer.WriteNumberValue(i);
                break;
            case long l:
                writer.WriteNumberValue(l);
                break;
            case double d:
                writer.WriteNumberValue(d);
                break;
            case decimal m:
                writer.WriteNumberValue(m);
                break;
            case JsonNode node:
                node.WriteTo(writer);
                break;
            default:
                writer.WriteStringValue(value.ToString());
                break;
        }
    }

    /// <summary>Converts a parsed JSON node back to a primitive CLR value (string, bool, number) or null.</summary>
    /// <param name="node">The node.</param>
    /// <returns>The CLR value.</returns>
    public static object? FromNode(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return node?.ToJsonString();
        }

        if (value.TryGetValue<string>(out var s))
        {
            return s;
        }

        if (value.TryGetValue<bool>(out var b))
        {
            return b;
        }

        if (value.TryGetValue<long>(out var l))
        {
            return l;
        }

        if (value.TryGetValue<decimal>(out var m))
        {
            return m;
        }

        return value.ToJsonString();
    }
}
