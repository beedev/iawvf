using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.ReferenceData;

namespace IAW.Vdf.Core.ReferenceData;

/// <summary>A dictionary-backed <see cref="IReferenceDataProvider"/>.</summary>
public sealed class InMemoryReferenceDataProvider : IReferenceDataProvider
{
    private readonly Dictionary<string, JsonNode?> _values;

    /// <summary>Creates an empty provider.</summary>
    public InMemoryReferenceDataProvider()
        : this(new Dictionary<string, JsonNode?>(StringComparer.Ordinal))
    {
    }

    /// <summary>Creates a provider seeded from the supplied map.</summary>
    /// <param name="values">The reference key/value map.</param>
    public InMemoryReferenceDataProvider(IDictionary<string, JsonNode?> values)
        => _values = new Dictionary<string, JsonNode?>(values, StringComparer.Ordinal);

    /// <summary>Adds or replaces a reference value, returning the provider for chaining.</summary>
    /// <param name="key">The reference key.</param>
    /// <param name="value">The value (converted to a <see cref="JsonNode"/>).</param>
    /// <returns>This provider.</returns>
    public InMemoryReferenceDataProvider Set(string key, JsonNode? value)
    {
        _values[key] = value;
        return this;
    }

    /// <inheritdoc />
    public bool TryResolve(string key, out JsonNode? value)
    {
        if (_values.TryGetValue(key, out var stored))
        {
            // Clone so callers cannot reparent the stored node.
            value = stored is null ? null : JsonNode.Parse(stored.ToJsonString());
            return true;
        }

        value = null;
        return false;
    }

    /// <inheritdoc />
    public JsonNode? Resolve(string key) => TryResolve(key, out var value) ? value : null;
}
