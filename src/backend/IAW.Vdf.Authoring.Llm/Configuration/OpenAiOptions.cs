using Microsoft.Extensions.Configuration;

namespace IAW.Vdf.Authoring.Llm.Configuration;

/// <summary>
/// Configuration for the live OpenAI rule interpreter. Bound from environment variables
/// (<c>OPENAI_API_KEY</c>, <c>OPENAI_MODEL</c>, <c>OPENAI_BASE_URL</c>, <c>OPENAI_ENABLED</c>) and,
/// optionally, an <see cref="IConfiguration"/> section. Environment variables always win, so the same
/// options bind identically whether driven from a <c>.env</c> file (Demo/tests) or production env vars.
/// </summary>
public sealed class OpenAiOptions
{
    /// <summary>The configuration section name when bound from <see cref="IConfiguration"/>.</summary>
    public const string SectionName = "OpenAi";

    /// <summary>
    /// The OpenAI API key. Never logged or surfaced in exception messages. When absent (and
    /// <see cref="Enabled"/> is <see langword="true"/>), the live interpreter throws so callers can fall
    /// back to the offline stub.
    /// </summary>
    public string? ApiKey { get; set; }

    /// <summary>The chat-completions model id. Defaults to <c>gpt-4.1</c>.</summary>
    public string Model { get; set; } = "gpt-4.1";

    /// <summary>The API base URL (no trailing slash required). Defaults to the public OpenAI endpoint.</summary>
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";

    /// <summary>Whether the live interpreter is enabled. When <see langword="false"/>, it refuses to call out.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Sampling temperature. Defaults to <c>0</c> for maximum determinism at authoring time.</summary>
    public double Temperature { get; set; } = 0;

    /// <summary>The per-request timeout in seconds. Defaults to <c>60</c>.</summary>
    public int TimeoutSeconds { get; set; } = 60;

    /// <summary><see langword="true"/> when the live path can be attempted (enabled and a key is present).</summary>
    public bool CanCallLiveModel => Enabled && !string.IsNullOrWhiteSpace(ApiKey);

    /// <summary>
    /// Builds an options instance from environment variables. Environment values override the supplied
    /// defaults; unset variables keep the defaults. Reads <c>OPENAI_API_KEY</c>, <c>OPENAI_MODEL</c>,
    /// <c>OPENAI_BASE_URL</c>, <c>OPENAI_ENABLED</c>, <c>OPENAI_TEMPERATURE</c>, <c>OPENAI_TIMEOUT_SECONDS</c>.
    /// </summary>
    /// <returns>The populated options.</returns>
    public static OpenAiOptions FromEnvironment()
    {
        var options = new OpenAiOptions();
        options.ApplyEnvironmentOverrides();
        return options;
    }

    /// <summary>
    /// Applies environment-variable overrides onto this instance in place. Only variables that are
    /// present (and non-empty) override existing values; this lets <c>.env</c>/<see cref="IConfiguration"/>
    /// supply defaults that real env vars can then trump.
    /// </summary>
    public void ApplyEnvironmentOverrides()
    {
        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (!string.IsNullOrWhiteSpace(apiKey))
            ApiKey = apiKey;

        var model = Environment.GetEnvironmentVariable("OPENAI_MODEL");
        if (!string.IsNullOrWhiteSpace(model))
            Model = model;

        var baseUrl = Environment.GetEnvironmentVariable("OPENAI_BASE_URL");
        if (!string.IsNullOrWhiteSpace(baseUrl))
            BaseUrl = baseUrl;

        var enabled = Environment.GetEnvironmentVariable("OPENAI_ENABLED");
        if (!string.IsNullOrWhiteSpace(enabled) && bool.TryParse(enabled, out var enabledValue))
            Enabled = enabledValue;

        var temperature = Environment.GetEnvironmentVariable("OPENAI_TEMPERATURE");
        if (!string.IsNullOrWhiteSpace(temperature) &&
            double.TryParse(temperature, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var temperatureValue))
            Temperature = temperatureValue;

        var timeout = Environment.GetEnvironmentVariable("OPENAI_TIMEOUT_SECONDS");
        if (!string.IsNullOrWhiteSpace(timeout) && int.TryParse(timeout, out var timeoutValue) && timeoutValue > 0)
            TimeoutSeconds = timeoutValue;
    }
}
