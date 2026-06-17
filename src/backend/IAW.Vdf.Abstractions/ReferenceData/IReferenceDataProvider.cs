using System.Text.Json.Nodes;

namespace IAW.Vdf.Abstractions.ReferenceData;

/// <summary>
/// Supplies reference data (policy thresholds, defaults, compatibility tables, eligibility lookups)
/// keyed by string identifiers such as <c>"PolicyThresholds.archiveAgeDays"</c>,
/// <c>"PolicyDefaults.fallbackGender"</c>, or composite keys like <c>"TestCompendium.compatible:{testCode}"</c>.
/// Reference-backed operators (IsCompatibleWith, IsEligibleFor, Exists) consult this provider.
/// </summary>
public interface IReferenceDataProvider
{
    /// <summary>Attempts to resolve a reference key.</summary>
    /// <param name="key">The reference key.</param>
    /// <param name="value">The resolved value, or <see langword="null"/> if not found.</param>
    /// <returns><see langword="true"/> if the key is known; otherwise <see langword="false"/>.</returns>
    bool TryResolve(string key, out JsonNode? value);

    /// <summary>Resolves a reference key, returning <see langword="null"/> if not found.</summary>
    /// <param name="key">The reference key.</param>
    /// <returns>The resolved value, or <see langword="null"/>.</returns>
    JsonNode? Resolve(string key);
}
