using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Persistence.Repositories;

/// <summary>
/// An <see cref="IReferenceDataProvider"/> backed by PostgreSQL via EF Core 8.
///
/// Key resolution mirrors <c>JsonReferenceDataProvider</c> semantics:
/// <list type="bullet">
///   <item>Literal key match: a key like <c>"TechnicalFISH"</c> matches a row with
///         <c>Source="TechnicalFISH"</c> and <c>Key=""</c>.</item>
///   <item>Dotted path: <c>"PolicyThresholds.archiveAgeDays"</c> splits into
///         Source=<c>"PolicyThresholds"</c> and Key=<c>"archiveAgeDays"</c>, returning
///         the JSONB value directly.</item>
///   <item>Deep dotted path: <c>"PolicyThresholds.fixationWindow.min"</c> splits into
///         Source=<c>"PolicyThresholds"</c> Key=<c>"fixationWindow"</c>, then the remainder
///         <c>".min"</c> is resolved by walking the returned JsonNode.</item>
/// </list>
/// Data is loaded eagerly on first access and cached in-process (reference data is typically
/// stable; the cache is invalidated by constructing a new instance).
/// </summary>
public sealed class EfReferenceDataProvider : IReferenceDataProvider
{
    private readonly VdfDbContext _db;
    private Dictionary<string, Dictionary<string, string>>? _cache; // Source -> Key -> ValueJson
    private readonly object _lock = new();

    /// <summary>Creates the provider over the supplied context.</summary>
    /// <param name="db">The VDF database context.</param>
    public EfReferenceDataProvider(VdfDbContext db) => _db = db;

    /// <inheritdoc />
    public bool TryResolve(string key, out JsonNode? value)
    {
        EnsureLoaded();

        var cache = _cache!;

        // 1. Try literal key as Source with empty sub-key (e.g. "TechnicalFISH" -> Source="TechnicalFISH", Key="")
        if (cache.TryGetValue(key, out var sourceDict) && sourceDict.TryGetValue("", out var json))
        {
            value = ParseNode(json);
            return true;
        }

        // 2. Try splitting on first dot: Source = first segment, remainder as dotted key
        var dotIdx = key.IndexOf('.');
        if (dotIdx > 0)
        {
            var source = key[..dotIdx];
            var remainder = key[(dotIdx + 1)..];

            if (cache.TryGetValue(source, out var dict))
            {
                // Try exact key match within source
                if (dict.TryGetValue(remainder, out var exactJson))
                {
                    value = ParseNode(exactJson);
                    return true;
                }

                // Try walking deeper: find a key that is a prefix of remainder
                // e.g. remainder = "fixationWindow.min" -> key "fixationWindow" -> walk ".min"
                foreach (var (entryKey, entryJson) in dict)
                {
                    if (remainder.StartsWith(entryKey + ".", StringComparison.Ordinal))
                    {
                        var deeperPath = remainder[(entryKey.Length + 1)..];
                        var node = ParseNode(entryJson);
                        var walked = WalkPath(node, deeperPath);
                        if (walked.found)
                        {
                            value = walked.node;
                            return true;
                        }
                    }
                }
            }
        }

        value = null;
        return false;
    }

    /// <inheritdoc />
    public JsonNode? Resolve(string key) => TryResolve(key, out var value) ? value : null;

    private void EnsureLoaded()
    {
        if (_cache is not null) return;

        lock (_lock)
        {
            if (_cache is not null) return;

            // Load all entries synchronously (provider is called from sync engine path).
            var entries = _db.ReferenceData.AsNoTracking().ToList();

            var cache = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
            foreach (var entry in entries)
            {
                if (!cache.TryGetValue(entry.Source, out var dict))
                {
                    dict = new Dictionary<string, string>(StringComparer.Ordinal);
                    cache[entry.Source] = dict;
                }

                dict[entry.Key] = entry.ValueJson;
            }

            _cache = cache;
        }
    }

    private static JsonNode? ParseNode(string json)
    {
        try { return JsonNode.Parse(json); }
        catch { return null; }
    }

    private static (bool found, JsonNode? node) WalkPath(JsonNode? node, string path)
    {
        var cursor = node;
        foreach (var segment in path.Split('.'))
        {
            if (cursor is JsonObject obj && obj.TryGetPropertyValue(segment, out var child))
            {
                cursor = child;
            }
            else
            {
                return (false, null);
            }
        }

        return (true, cursor is null ? null : JsonNode.Parse(cursor.ToJsonString()));
    }
}
