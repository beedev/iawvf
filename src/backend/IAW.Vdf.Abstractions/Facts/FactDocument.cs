using System.Globalization;
using System.Text.Json.Nodes;

namespace IAW.Vdf.Abstractions.Facts;

/// <summary>
/// The fact substrate for rule evaluation. Wraps a mutable <see cref="JsonObject"/> tree and
/// exposes dotted-path resolution (e.g. <c>"specimen.age"</c>, <c>"order.client.nyStatus"</c>)
/// together with typed coercion helpers.
/// </summary>
/// <remarks>
/// Collections are addressed with a trailing <c>[]</c> on a segment (e.g. <c>"order.tests[]"</c>)
/// and resolved via <see cref="ResolveAll"/> for use with quantifiers (Any/Every). A specific
/// index may also be addressed (e.g. <c>"order.tests[0].code"</c>).
/// </remarks>
public sealed class FactDocument
{
    private readonly JsonObject _root;

    /// <summary>Creates a fact document over the supplied JSON object tree.</summary>
    /// <param name="root">The backing JSON object. If <see langword="null"/>, an empty object is used.</param>
    public FactDocument(JsonObject? root = null)
    {
        _root = root ?? new JsonObject();
    }

    /// <summary>Parses a JSON string into a <see cref="FactDocument"/>.</summary>
    /// <param name="json">A JSON object document.</param>
    /// <returns>A new fact document.</returns>
    /// <exception cref="ArgumentException">The JSON does not represent an object.</exception>
    public static FactDocument Parse(string json)
    {
        var node = JsonNode.Parse(json);
        if (node is not JsonObject obj)
        {
            throw new ArgumentException("Fact document JSON must be an object.", nameof(json));
        }

        return new FactDocument(obj);
    }

    /// <summary>The underlying JSON object tree. Mutations are visible to subsequent rule evaluation (rule chaining).</summary>
    public JsonObject Root => _root;

    /// <summary>Produces an independent deep copy of this document so a rule run cannot mutate the caller's facts.</summary>
    /// <returns>A cloned fact document.</returns>
    public FactDocument Clone()
    {
        var clone = JsonNode.Parse(_root.ToJsonString());
        return new FactDocument(clone as JsonObject ?? new JsonObject());
    }

    /// <summary>Serializes the document back to a JSON string.</summary>
    /// <returns>The JSON representation.</returns>
    public string ToJsonString() => _root.ToJsonString();

    /// <summary>
    /// Resolves a dotted path to a single <see cref="JsonNode"/>. Returns <see langword="null"/> when any
    /// segment is missing. For collection segments without an index, the first element is returned.
    /// </summary>
    /// <param name="path">A dotted path such as <c>"specimen.age"</c>.</param>
    /// <returns>The resolved node, or <see langword="null"/> if not present.</returns>
    public JsonNode? Resolve(string path)
    {
        var all = ResolveAll(path);
        return all.Count > 0 ? all[0] : null;
    }

    /// <summary>
    /// Resolves a dotted path to all matching nodes. When a segment ends in <c>[]</c> the path fans out
    /// across every element of that array; otherwise a single-element (or empty) list is returned.
    /// </summary>
    /// <param name="path">A dotted path, optionally containing <c>[]</c> collection segments.</param>
    /// <returns>The matching nodes (possibly empty).</returns>
    public IReadOnlyList<JsonNode?> ResolveAll(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Array.Empty<JsonNode?>();
        }

        // Cursor set begins with the root and is expanded segment by segment.
        var current = new List<JsonNode?> { _root };

        foreach (var rawSegment in path.Split('.'))
        {
            var next = new List<JsonNode?>();
            ParseSegment(rawSegment, out var name, out var fanOut, out var index);

            foreach (var node in current)
            {
                if (node is not JsonObject obj || !obj.TryGetPropertyValue(name, out var child))
                {
                    continue;
                }

                if (fanOut)
                {
                    if (child is JsonArray arr)
                    {
                        foreach (var element in arr)
                        {
                            next.Add(element);
                        }
                    }
                }
                else if (index is int i)
                {
                    if (child is JsonArray arr && i >= 0 && i < arr.Count)
                    {
                        next.Add(arr[i]);
                    }
                }
                else
                {
                    next.Add(child);
                }
            }

            current = next;
        }

        return current;
    }

    /// <summary>
    /// Writes a value at the supplied dotted path, creating intermediate objects as needed. This is how
    /// derivation outcomes and apply-default recovery stamp facts back into the working document so that
    /// later-phase rules can read them (rule chaining).
    /// </summary>
    /// <param name="path">A dotted path (collection fan-out is not supported for writes).</param>
    /// <param name="value">The value node to assign (may be <see langword="null"/>).</param>
    public void Set(string path, JsonNode? value)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new ArgumentException("Path must be provided.", nameof(path));
        }

        var segments = path.Split('.');
        JsonObject cursor = _root;

        for (var s = 0; s < segments.Length - 1; s++)
        {
            var name = segments[s];
            if (cursor[name] is JsonObject existing)
            {
                cursor = existing;
            }
            else
            {
                var created = new JsonObject();
                cursor[name] = created;
                cursor = created;
            }
        }

        cursor[segments[^1]] = value;
    }

    /// <summary>Resolves a path to a string value via coercion, or <see langword="null"/> if absent.</summary>
    /// <param name="path">A dotted path.</param>
    /// <returns>The coerced string value.</returns>
    public string? GetString(string path) => CoerceString(Resolve(path));

    /// <summary>Resolves a path to a decimal value, or <see langword="null"/> if absent / not numeric.</summary>
    /// <param name="path">A dotted path.</param>
    /// <returns>The coerced decimal value.</returns>
    public decimal? GetDecimal(string path) => CoerceDecimal(Resolve(path));

    /// <summary>Resolves a path to a <see cref="DateTimeOffset"/>, or <see langword="null"/> if absent / not a date.</summary>
    /// <param name="path">A dotted path.</param>
    /// <returns>The coerced date value.</returns>
    public DateTimeOffset? GetDateTimeOffset(string path) => CoerceDateTimeOffset(Resolve(path));

    /// <summary>Resolves a path to a boolean value, or <see langword="null"/> if absent / not boolean.</summary>
    /// <param name="path">A dotted path.</param>
    /// <returns>The coerced boolean value.</returns>
    public bool? GetBool(string path) => CoerceBool(Resolve(path));

    /// <summary>Coerces a node to a string (enums are stored as strings, so this also serves enum-as-string).</summary>
    /// <param name="node">The node to coerce.</param>
    /// <returns>The string representation, or <see langword="null"/>.</returns>
    public static string? CoerceString(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        if (node is JsonValue value)
        {
            if (value.TryGetValue<string>(out var s))
            {
                return s;
            }

            if (value.TryGetValue<bool>(out var b))
            {
                return b ? "true" : "false";
            }

            if (value.TryGetValue<decimal>(out var d))
            {
                return d.ToString(CultureInfo.InvariantCulture);
            }

            return value.ToString();
        }

        return node.ToJsonString();
    }

    /// <summary>Coerces a node to a decimal, accepting numeric or numeric-string values.</summary>
    /// <param name="node">The node to coerce.</param>
    /// <returns>The decimal value, or <see langword="null"/>.</returns>
    public static decimal? CoerceDecimal(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<decimal>(out var d))
        {
            return d;
        }

        if (value.TryGetValue<double>(out var dbl))
        {
            return (decimal)dbl;
        }

        if (value.TryGetValue<long>(out var l))
        {
            return l;
        }

        if (value.TryGetValue<string>(out var s) &&
            decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    /// <summary>Coerces a node to a <see cref="DateTimeOffset"/>, accepting ISO-8601 strings or epoch-like values.</summary>
    /// <param name="node">The node to coerce.</param>
    /// <returns>The date value, or <see langword="null"/>.</returns>
    public static DateTimeOffset? CoerceDateTimeOffset(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<DateTimeOffset>(out var dto))
        {
            return dto;
        }

        if (value.TryGetValue<string>(out var s) &&
            DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    /// <summary>Coerces a node to a boolean, accepting boolean or boolean-string values.</summary>
    /// <param name="node">The node to coerce.</param>
    /// <returns>The boolean value, or <see langword="null"/>.</returns>
    public static bool? CoerceBool(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<bool>(out var b))
        {
            return b;
        }

        if (value.TryGetValue<string>(out var s) && bool.TryParse(s, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static void ParseSegment(string segment, out string name, out bool fanOut, out int? index)
    {
        fanOut = false;
        index = null;
        name = segment;

        var open = segment.IndexOf('[');
        if (open < 0 || !segment.EndsWith("]", StringComparison.Ordinal))
        {
            return;
        }

        name = segment[..open];
        var inner = segment[(open + 1)..^1];

        if (inner.Length == 0)
        {
            fanOut = true;
        }
        else if (int.TryParse(inner, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i))
        {
            index = i;
        }
    }
}
