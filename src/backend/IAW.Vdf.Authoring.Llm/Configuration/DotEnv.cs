namespace IAW.Vdf.Authoring.Llm.Configuration;

/// <summary>
/// A minimal <c>.env</c> loader for local development and tests. Loads <c>KEY=VALUE</c> lines from a
/// <c>.env</c> file into process environment variables when they are not already set, so a real
/// environment variable always wins over the file. This is intentionally tiny and dependency-free; it is
/// used by the Demo and the gated live smoke test, and is never required in production (where real env
/// vars or secret stores supply the values).
/// </summary>
public static class DotEnv
{
    /// <summary>
    /// Loads the <c>.env</c> file at <paramref name="path"/> into the process environment, skipping keys
    /// that already have a value. Lines beginning with <c>#</c> and blank lines are ignored. Surrounding
    /// single or double quotes around a value are stripped. No-ops silently when the file is absent.
    /// </summary>
    /// <param name="path">The absolute path to the <c>.env</c> file.</param>
    /// <param name="overrideExisting">When <see langword="true"/>, file values replace existing env vars.</param>
    /// <returns>The number of variables applied.</returns>
    public static int Load(string path, bool overrideExisting = false)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return 0;

        var applied = 0;
        foreach (var rawLine in File.ReadLines(path))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line[0] == '#')
                continue;

            // Tolerate an optional leading "export ".
            if (line.StartsWith("export ", StringComparison.Ordinal))
                line = line["export ".Length..].TrimStart();

            var separator = line.IndexOf('=');
            if (separator <= 0)
                continue;

            var key = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();

            if (value.Length >= 2 &&
                ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
            {
                value = value[1..^1];
            }

            if (!overrideExisting && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                continue;

            Environment.SetEnvironmentVariable(key, value);
            applied++;
        }

        return applied;
    }

    /// <summary>
    /// Searches upward from <paramref name="startDirectory"/> for a <c>.env</c> file and loads it if found.
    /// Useful for tests/Demo where the working directory is a build output folder deep under the repo root.
    /// </summary>
    /// <param name="startDirectory">The directory to start searching from. Defaults to the current directory.</param>
    /// <param name="overrideExisting">When <see langword="true"/>, file values replace existing env vars.</param>
    /// <returns>The number of variables applied (0 when no <c>.env</c> was found).</returns>
    public static int LoadFromAncestors(string? startDirectory = null, bool overrideExisting = false)
    {
        var dir = startDirectory ?? Directory.GetCurrentDirectory();
        while (!string.IsNullOrEmpty(dir))
        {
            var candidate = Path.Combine(dir, ".env");
            if (File.Exists(candidate))
                return Load(candidate, overrideExisting);

            dir = Directory.GetParent(dir)?.FullName;
        }

        return 0;
    }
}
