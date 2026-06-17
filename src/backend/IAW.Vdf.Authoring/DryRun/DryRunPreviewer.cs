using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.Outcomes;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Time;

namespace IAW.Vdf.Authoring.DryRun;

/// <summary>Represents the outcome of running a candidate rule against a single fixture.</summary>
/// <param name="FixtureName">The name of the fixture file or fixture label.</param>
/// <param name="Applied">Whether the rule's AppliesWhen guard held (rule was evaluated).</param>
/// <param name="Produced">The type of the outcome produced, if the rule applied.</param>
/// <param name="Reason">The reason string from the produced outcome, if any.</param>
public sealed record DryRunHit(string FixtureName, bool Applied, OutcomeType? Produced, string? Reason);

/// <summary>Summary results for a dry-run preview over a set of fixtures.</summary>
/// <param name="Evaluated">The total number of fixtures evaluated.</param>
/// <param name="Hits">Per-fixture evaluation results.</param>
public sealed record DryRunResult(int Evaluated, IReadOnlyList<DryRunHit> Hits);

/// <summary>
/// Evaluates a candidate <see cref="RuleDefinition"/> against fact fixtures in a no-side-effects
/// sandbox, using a <see cref="CollectingOutcomeHandler"/> so no external state is mutated.
/// </summary>
public sealed class DryRunPreviewer
{
    private readonly IReferenceDataProvider _references;

    /// <summary>
    /// Creates a new <see cref="DryRunPreviewer"/> backed by the supplied reference-data provider.
    /// </summary>
    /// <param name="references">Reference data needed to resolve rule conditions.</param>
    public DryRunPreviewer(IReferenceDataProvider references)
    {
        _references = references;
    }

    /// <summary>
    /// Runs the candidate rule against each named fixture and returns a summary of hits.
    /// No external state is modified; the engine operates on clones of each <see cref="FactDocument"/>.
    /// </summary>
    /// <param name="candidate">The rule to preview.</param>
    /// <param name="fixtures">Named fact documents to evaluate.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A <see cref="DryRunResult"/> containing per-fixture hit records.</returns>
    public async Task<DryRunResult> PreviewAsync(
        RuleDefinition candidate,
        IEnumerable<(string Name, FactDocument Facts)> fixtures,
        CancellationToken cancellationToken = default)
    {
        var handler = new CollectingOutcomeHandler();
        var engine = BuildEngine(candidate, handler);
        var hits = new List<DryRunHit>();

        foreach (var (name, facts) in fixtures)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var request = new EvaluationRequest
            {
                Trigger = Trigger.OrderEvent("dry-run"),
                Facts = facts,
                AsOf = DateTimeOffset.UtcNow,
                RuleSet = null
            };

            var result = await engine.EvaluateAsync(request, cancellationToken).ConfigureAwait(false);

            // Find the trace for this specific rule.
            var trace = result.Trace.FirstOrDefault(t => t.RuleKey == candidate.Key);
            if (trace is null)
            {
                hits.Add(new DryRunHit(name, false, null, null));
                continue;
            }

            var produced = trace.Produced;
            hits.Add(new DryRunHit(name, trace.Applied, produced?.Type, produced?.Reason));
        }

        return new DryRunResult(hits.Count, hits);
    }

    /// <summary>
    /// Loads all <c>*.json</c> files from the specified directory as fixtures and previews the candidate rule.
    /// Files named <c>reference-data.json</c> are skipped.
    /// </summary>
    /// <param name="candidate">The rule to preview.</param>
    /// <param name="fixturesDirectory">Path to a directory containing fixture JSON files.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A <see cref="DryRunResult"/> containing per-fixture hit records.</returns>
    public async Task<DryRunResult> PreviewFromDirectoryAsync(
        RuleDefinition candidate,
        string fixturesDirectory,
        CancellationToken cancellationToken = default)
    {
        var files = Directory
            .GetFiles(fixturesDirectory, "*.json")
            .Where(f => !string.Equals(
                Path.GetFileName(f),
                "reference-data.json",
                StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f, StringComparer.Ordinal)
            .ToList();

        var fixtures = files.Select(path =>
        {
            var json = File.ReadAllText(path);
            var facts = FactDocument.Parse(json);
            var name = Path.GetFileNameWithoutExtension(path);
            return (name, facts);
        });

        return await PreviewAsync(candidate, fixtures, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Locates the repository's <c>fixtures/</c> directory by walking upward from
    /// <see cref="AppContext.BaseDirectory"/>, then previews the candidate rule against all fixtures.
    /// </summary>
    /// <param name="candidate">The rule to preview.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A <see cref="DryRunResult"/> containing per-fixture hit records.</returns>
    public Task<DryRunResult> PreviewFromRepoFixturesAsync(
        RuleDefinition candidate,
        CancellationToken cancellationToken = default)
    {
        var dir = FindDir("fixtures");
        return PreviewFromDirectoryAsync(candidate, dir, cancellationToken);
    }

    // ── Private helpers ──────────────────────────────────────────────────────────────────────────

    private VdfEngine BuildEngine(RuleDefinition candidate, CollectingOutcomeHandler handler)
    {
        var repository = new InMemoryRuleRepository(new[] { candidate });
        var clock = new FixedClock(DateTimeOffset.UtcNow);
        var selector = new RuleSelector();
        return new VdfEngine(repository, _references, selector, clock, new[] { handler });
    }

    private static string FindDir(string name)
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            var candidate = Path.Combine(dir, name);
            if (Directory.Exists(candidate))
                return candidate;
            dir = Directory.GetParent(dir)?.FullName;
        }
        var abs = $"/Users/bharath/Desktop/NeoGenomics/IAW/{name}";
        if (Directory.Exists(abs)) return abs;
        throw new DirectoryNotFoundException($"Could not locate '{name}' directory.");
    }
}
