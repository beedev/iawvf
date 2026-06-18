using System.Globalization;
using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.ReferenceData;

namespace IAW.Vdf.Abstractions.Conditions;

/// <summary>
/// The deterministic semantics for every <see cref="OperatorKind"/>. This is the single source of truth
/// for operator behaviour, with type coercion (numbers, dates, strings, sets) and reference-data
/// consultation for the matching and eligibility families. Core's <c>OperatorEvaluator</c> delegates here.
/// </summary>
public static class OperatorSemantics
{
    /// <summary>
    /// Evaluates a single operator against a left value (from a fact path) and a right comparand
    /// (a literal node or a reference-resolved node).
    /// </summary>
    /// <param name="op">The operator to apply.</param>
    /// <param name="left">The resolved subject value (may be <see langword="null"/> when absent).</param>
    /// <param name="right">The resolved comparand (literal or reference value, may be <see langword="null"/>).</param>
    /// <param name="references">Reference-data provider for reference-backed operators.</param>
    /// <param name="referenceKey">The reference key in play, when the comparand is reference-backed.</param>
    /// <returns>The boolean result.</returns>
    public static bool Evaluate(
        OperatorKind op,
        JsonNode? left,
        JsonNode? right,
        IReferenceDataProvider references,
        string? referenceKey = null)
    {
        return op switch
        {
            OperatorKind.IsPresent => left is not null,
            OperatorKind.IsAbsent => left is null,

            OperatorKind.Equals => ValuesEqual(left, right),
            OperatorKind.NotEquals => left is not null && !ValuesEqual(left, right),

            OperatorKind.InSet => IsMember(left, right),
            OperatorKind.NotInSet => left is not null && !IsMember(left, right),

            OperatorKind.GreaterThan => Compare(left, right) is { } c && c > 0,
            OperatorKind.LessThan => Compare(left, right) is { } c && c < 0,
            OperatorKind.GreaterOrEqual => Compare(left, right) is { } c && c >= 0,
            OperatorKind.LessOrEqual => Compare(left, right) is { } c && c <= 0,
            OperatorKind.WithinRange => WithinRange(left, right),

            OperatorKind.Matches => Matches(left, right, references, referenceKey),
            OperatorKind.IsCompatibleWith => ReferenceContains(left, right, references, referenceKey),

            OperatorKind.IsEligibleFor => ReferenceContains(left, right, references, referenceKey),
            OperatorKind.Exists => Exists(left, right, references, referenceKey),

            _ => false,
        };
    }

    private static bool ValuesEqual(JsonNode? left, JsonNode? right)
    {
        if (left is null || right is null)
        {
            return left is null && right is null;
        }

        // Numeric comparison first (so 30 == 30.0).
        var ld = FactDocument.CoerceDecimal(left);
        var rd = FactDocument.CoerceDecimal(right);
        if (ld is not null && rd is not null)
        {
            return ld.Value == rd.Value;
        }

        // Boolean comparison.
        var lb = FactDocument.CoerceBool(left);
        var rb = FactDocument.CoerceBool(right);
        if (lb is not null && rb is not null)
        {
            return lb.Value == rb.Value;
        }

        // Fall back to ordinal string comparison (covers enum-as-string).
        return string.Equals(FactDocument.CoerceString(left), FactDocument.CoerceString(right), StringComparison.Ordinal);
    }

    private static bool IsMember(JsonNode? left, JsonNode? right)
    {
        if (left is null)
        {
            return false;
        }

        foreach (var element in EnumerateSet(right))
        {
            if (ValuesEqual(left, element))
            {
                return true;
            }
        }

        return false;
    }

    private static int? Compare(JsonNode? left, JsonNode? right)
    {
        if (left is null || right is null)
        {
            return null;
        }

        var ld = FactDocument.CoerceDecimal(left);
        var rd = FactDocument.CoerceDecimal(right);
        if (ld is not null && rd is not null)
        {
            return ld.Value.CompareTo(rd.Value);
        }

        var ldate = FactDocument.CoerceDateTimeOffset(left);
        var rdate = FactDocument.CoerceDateTimeOffset(right);
        if (ldate is not null && rdate is not null)
        {
            return ldate.Value.CompareTo(rdate.Value);
        }

        var ls = FactDocument.CoerceString(left);
        var rs = FactDocument.CoerceString(right);
        if (ls is not null && rs is not null)
        {
            return string.CompareOrdinal(ls, rs);
        }

        return null;
    }

    private static bool WithinRange(JsonNode? left, JsonNode? right)
    {
        if (left is null || right is not JsonObject range)
        {
            return false;
        }

        var min = range["min"];
        var max = range["max"];

        var aboveMin = min is null || Compare(left, min) is { } cmin && cmin >= 0;
        var belowMax = max is null || Compare(left, max) is { } cmax && cmax <= 0;

        // If min/max present they must yield a comparable result; absence of a bound means open on that side.
        if (min is not null && Compare(left, min) is null)
        {
            return false;
        }

        if (max is not null && Compare(left, max) is null)
        {
            return false;
        }

        return aboveMin && belowMax;
    }

    private static bool Matches(JsonNode? left, JsonNode? right, IReferenceDataProvider references, string? referenceKey)
    {
        // Reference-backed match (compatibility set) takes precedence when a reference key is supplied.
        if (referenceKey is not null)
        {
            return ReferenceContains(left, right, references, referenceKey);
        }

        if (left is null || right is null)
        {
            return false;
        }

        var subject = FactDocument.CoerceString(left);
        var pattern = FactDocument.CoerceString(right);
        if (subject is null || pattern is null)
        {
            return false;
        }

        try
        {
            // ReDoS guard (H3): bound matching time so a pathological pattern/input cannot hang the
            // engine. A timeout is treated as no-match.
            return System.Text.RegularExpressions.Regex.IsMatch(
                subject,
                pattern,
                System.Text.RegularExpressions.RegexOptions.None,
                TimeSpan.FromMilliseconds(100));
        }
        catch (System.Text.RegularExpressions.RegexMatchTimeoutException)
        {
            // Match exceeded the time budget — treat as no-match.
            return false;
        }
        catch (ArgumentException)
        {
            // Not a valid regex — fall back to exact match.
            return string.Equals(subject, pattern, StringComparison.Ordinal);
        }
    }

    private static bool ReferenceContains(JsonNode? left, JsonNode? right, IReferenceDataProvider references, string? referenceKey)
    {
        if (left is null)
        {
            return false;
        }

        // The reference (when supplied) provides the authoritative set/value the subject must match against.
        var authority = referenceKey is not null ? references.Resolve(referenceKey) : right;
        if (authority is null)
        {
            return false;
        }

        // Set membership: subject must be one of the authoritative values.
        return IsMember(left, authority) || ValuesEqual(left, authority);
    }

    private static bool Exists(JsonNode? left, JsonNode? right, IReferenceDataProvider references, string? referenceKey)
    {
        // Existence is confirmed by a reference lookup resolving to a truthy/non-empty value.
        if (referenceKey is not null)
        {
            if (!references.TryResolve(referenceKey, out var resolved) || resolved is null)
            {
                return false;
            }

            return IsTruthy(resolved);
        }

        return left is not null || (right is not null && IsTruthy(right));
    }

    private static bool IsTruthy(JsonNode node)
    {
        var b = FactDocument.CoerceBool(node);
        if (b is not null)
        {
            return b.Value;
        }

        if (node is JsonArray arr)
        {
            return arr.Count > 0;
        }

        var s = FactDocument.CoerceString(node);
        return !string.IsNullOrEmpty(s);
    }

    private static IEnumerable<JsonNode?> EnumerateSet(JsonNode? set)
    {
        switch (set)
        {
            case null:
                yield break;
            case JsonArray arr:
                foreach (var element in arr)
                {
                    yield return element;
                }

                break;
            case JsonValue value when value.TryGetValue<string>(out var csv) && csv.Contains(','):
                foreach (var part in csv.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
                {
                    yield return JsonValue.Create(part);
                }

                break;
            default:
                yield return set;
                break;
        }
    }
}
