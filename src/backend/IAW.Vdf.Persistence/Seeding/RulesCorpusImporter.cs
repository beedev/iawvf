using System.Text.Json;
using System.Text.Json.Nodes;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Persistence.Entities;
using IAW.Vdf.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Persistence.Seeding;

/// <summary>
/// Imports the rules corpus (a directory of <c>*.json</c> rule files) and the
/// <c>reference-data.json</c> file into the Postgres database via <see cref="EfRuleRepository"/>
/// and the <see cref="VdfDbContext"/> directly for reference data.
///
/// Rules are upserted using <see cref="EfRuleRepository.SaveAsync"/> so versioning semantics are
/// honoured. Reference data is upserted by (Source, Key) pairs, flattening the JSON object
/// hierarchy into individual rows.
/// </summary>
public sealed class RulesCorpusImporter
{
    private readonly EfRuleRepository _ruleRepo;
    private readonly VdfDbContext _db;

    /// <summary>Creates the importer.</summary>
    /// <param name="ruleRepo">The EF rule repository.</param>
    /// <param name="db">The VDF database context.</param>
    public RulesCorpusImporter(EfRuleRepository ruleRepo, VdfDbContext db)
    {
        _ruleRepo = ruleRepo;
        _db = db;
    }

    /// <summary>
    /// Imports all rules from <paramref name="rulesDirectory"/> and reference data from
    /// <paramref name="referenceDataPath"/> into Postgres.
    /// </summary>
    /// <param name="rulesDirectory">Path to the directory containing <c>*.json</c> rule files.</param>
    /// <param name="referenceDataPath">Path to <c>reference-data.json</c>.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    public async Task ImportAsync(
        string rulesDirectory,
        string referenceDataPath,
        CancellationToken cancellationToken = default)
    {
        await ImportRulesAsync(rulesDirectory, cancellationToken).ConfigureAwait(false);
        await ImportReferenceDataAsync(referenceDataPath, cancellationToken).ConfigureAwait(false);
    }

    private async Task ImportRulesAsync(string rulesDirectory, CancellationToken cancellationToken)
    {
        var files = Directory.EnumerateFiles(rulesDirectory, "*.json", SearchOption.TopDirectoryOnly)
            .Where(f => !Path.GetFileName(f).Equals("reference-data.json", StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f, StringComparer.Ordinal);

        foreach (var file in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var json = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
            var trimmed = json.TrimStart();

            if (trimmed.StartsWith('['))
            {
                var rules = RuleSerializer.DeserializeMany(json);
                foreach (var rule in rules)
                {
                    await _ruleRepo.SaveAsync(rule, cancellationToken).ConfigureAwait(false);
                }
            }
            else
            {
                var rule = RuleSerializer.Deserialize(json);
                await _ruleRepo.SaveAsync(rule, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private async Task ImportReferenceDataAsync(string referenceDataPath, CancellationToken cancellationToken)
    {
        if (!File.Exists(referenceDataPath))
        {
            return;
        }

        var json = await File.ReadAllTextAsync(referenceDataPath, cancellationToken).ConfigureAwait(false);
        var root = JsonNode.Parse(json) as JsonObject
            ?? throw new InvalidOperationException("reference-data.json must be a JSON object.");

        foreach (var (topKey, topValue) in root)
        {
            if (topValue is null) continue;

            if (topValue is JsonObject nestedObj)
            {
                // Flatten: Source=topKey, Key=each nested property
                foreach (var (nestedKey, nestedValue) in nestedObj)
                {
                    await UpsertReferenceDataAsync(topKey, nestedKey, nestedValue?.ToJsonString() ?? "null", cancellationToken)
                        .ConfigureAwait(false);
                }
            }
            else
            {
                // Scalar or array at top level: Source=topKey, Key=""
                await UpsertReferenceDataAsync(topKey, "", topValue.ToJsonString(), cancellationToken)
                    .ConfigureAwait(false);
            }
        }
    }

    private async Task UpsertReferenceDataAsync(
        string source, string key, string valueJson, CancellationToken cancellationToken)
    {
        var existing = await _db.ReferenceData
            .FirstOrDefaultAsync(r => r.Source == source && r.Key == key, cancellationToken)
            .ConfigureAwait(false);

        if (existing is null)
        {
            _db.ReferenceData.Add(new ReferenceDataEntity
            {
                Id = Guid.NewGuid(),
                Source = source,
                Key = key,
                ValueJson = valueJson,
            });
        }
        else
        {
            existing.ValueJson = valueJson;
        }

        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
