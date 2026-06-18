using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace IAW.Vdf.Abstractions.Vocabulary;

/// <summary>
/// Shared conventions for governed vocabulary subject paths so the seeder, provider, admin API, and impact
/// analysis all derive object names and labels identically and validate paths against one canonical pattern.
///
/// A valid path is one or more dotted segments of <c>[A-Za-z][A-Za-z0-9]*</c> with an OPTIONAL trailing
/// <c>[]</c> on the final segment (collections). Examples: <c>specimen.fixationTime</c>, <c>order.tests[]</c>,
/// <c>order.client.nyStatus</c>.
/// </summary>
public static partial class VocabularyPathConventions
{
    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*(\[\])?$", RegexOptions.CultureInvariant)]
    private static partial Regex PathRegex();

    /// <summary>Determines whether a path matches the canonical subject pattern.</summary>
    /// <param name="path">The candidate path.</param>
    /// <returns><see langword="true"/> if the path is well-formed.</returns>
    public static bool IsValidPath(string? path) =>
        !string.IsNullOrWhiteSpace(path) && PathRegex().IsMatch(path);

    /// <summary>
    /// The owning object name for a subject path: the first dotted segment with any trailing <c>[]</c>
    /// stripped (e.g. <c>"order.client.nyStatus"</c> → <c>"order"</c>, <c>"order.tests[]"</c> → <c>"order"</c>).
    /// </summary>
    /// <param name="path">The subject path.</param>
    /// <returns>The object name.</returns>
    public static string ObjectName(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        var dot = path.IndexOf('.');
        var first = dot < 0 ? path : path[..dot];
        return StripCollectionSuffix(first);
    }

    /// <summary>Strips a trailing <c>[]</c> collection marker from a segment or path, if present.</summary>
    /// <param name="value">The segment or path.</param>
    /// <returns>The value without a trailing <c>[]</c>.</returns>
    public static string StripCollectionSuffix(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        return value.EndsWith("[]", StringComparison.Ordinal) ? value[..^2] : value;
    }

    /// <summary>
    /// Humanizes a camelCase token into a display label: splits on lowerUpper boundaries and title-cases
    /// each word (e.g. <c>"medicalReview"</c> → <c>"Medical Review"</c>, <c>"order"</c> → <c>"Order"</c>).
    /// </summary>
    /// <param name="name">The camelCase token.</param>
    /// <returns>The humanized label.</returns>
    public static string Humanize(string name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return name;
        }

        var builder = new StringBuilder(name.Length + 4);
        for (var i = 0; i < name.Length; i++)
        {
            var current = name[i];
            if (i > 0 && char.IsUpper(current) && !char.IsUpper(name[i - 1]))
            {
                builder.Append(' ');
            }

            builder.Append(current);
        }

        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(builder.ToString());
    }
}
