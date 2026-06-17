using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.ReferenceData;

namespace IAW.Vdf.Core.ReferenceData;

/// <summary>
/// A <see cref="IReferenceDataProvider"/> loaded from a JSON object document where each top-level
/// property is a reference key. Nested objects may also be addressed with dotted keys
/// (e.g. <c>"PolicyThresholds.archiveAgeDays"</c>).
/// </summary>
public sealed class JsonReferenceDataProvider : IReferenceDataProvider
{
    private readonly JsonObject _root;

    /// <summary>Creates a provider over the supplied JSON object.</summary>
    /// <param name="root">The reference data root object.</param>
    public JsonReferenceDataProvider(JsonObject root) => _root = root;

    /// <summary>Loads reference data from a JSON file.</summary>
    /// <param name="path">The file path.</param>
    /// <returns>A new provider.</returns>
    /// <exception cref="ArgumentException">The file does not contain a JSON object.</exception>
    public static JsonReferenceDataProvider FromFile(string path)
    {
        var json = File.ReadAllText(path);
        return FromJson(json);
    }

    /// <summary>Loads reference data from a JSON string.</summary>
    /// <param name="json">The JSON object document.</param>
    /// <returns>A new provider.</returns>
    /// <exception cref="ArgumentException">The JSON does not represent an object.</exception>
    public static JsonReferenceDataProvider FromJson(string json)
    {
        if (JsonNode.Parse(json) is not JsonObject obj)
        {
            throw new ArgumentException("Reference data JSON must be an object.", nameof(json));
        }

        return new JsonReferenceDataProvider(obj);
    }

    /// <inheritdoc />
    public bool TryResolve(string key, out JsonNode? value)
    {
        // Try the literal key first (keys may legitimately contain dots).
        if (_root.TryGetPropertyValue(key, out var direct))
        {
            value = Clone(direct);
            return true;
        }

        // Otherwise walk a dotted path through nested objects.
        JsonNode? cursor = _root;
        foreach (var segment in key.Split('.'))
        {
            if (cursor is JsonObject obj && obj.TryGetPropertyValue(segment, out var child))
            {
                cursor = child;
            }
            else
            {
                value = null;
                return false;
            }
        }

        value = Clone(cursor);
        return true;
    }

    /// <inheritdoc />
    public JsonNode? Resolve(string key) => TryResolve(key, out var value) ? value : null;

    private static JsonNode? Clone(JsonNode? node) => node is null ? null : JsonNode.Parse(node.ToJsonString());
}
