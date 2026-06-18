using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.Llm.Configuration;
using IAW.Vdf.Authoring.Llm.Prompting;
using Microsoft.Extensions.Options;

namespace IAW.Vdf.Authoring.Llm.Interpretation;

/// <summary>
/// The live OpenAI-backed <see cref="IRuleInterpreter"/> — the constrained "compiler front-end". It grounds
/// the model in the live <see cref="VocabularyCatalog"/>, calls OpenAI Chat Completions with Structured
/// Outputs (<c>response_format = json_schema, strict</c>) to obtain a typed envelope, then runs every
/// candidate through the deterministic <see cref="RuleInterpretationGate"/> (schema + lint) before returning.
/// The model's output is always a <em>proposal</em>; the gate is the source of truth for validity.
/// </summary>
public sealed class OpenAiRuleInterpreter : IRuleInterpreter
{
    /// <summary>
    /// The interpreter version string, recorded for provenance (HLD §6) so a future interpreter change can
    /// not silently alter the meaning of a previously authored rule.
    /// </summary>
    public const string InterpreterVersion = "openai-rule-interpreter/1.0.0";

    /// <summary>Maximum accepted natural-language input length (M3: LLM cost / DoS guard).</summary>
    private const int MaxNaturalLanguageLength = 4000;

    private readonly HttpClient _httpClient;
    private readonly OpenAiOptions _options;
    private readonly IReferenceDataProvider _references;

    /// <summary>Creates the interpreter.</summary>
    /// <param name="httpClient">The HTTP client (typically from <c>IHttpClientFactory</c>).</param>
    /// <param name="options">The OpenAI options.</param>
    /// <param name="references">The reference data provider used by the validation gate's linter.</param>
    public OpenAiRuleInterpreter(HttpClient httpClient, IOptions<OpenAiOptions> options, IReferenceDataProvider references)
        : this(httpClient, options?.Value ?? throw new ArgumentNullException(nameof(options)), references)
    {
    }

    /// <summary>Creates the interpreter from a plain options instance (convenient for Demo/manual use).</summary>
    /// <param name="httpClient">The HTTP client.</param>
    /// <param name="options">The OpenAI options.</param>
    /// <param name="references">The reference data provider used by the validation gate's linter.</param>
    public OpenAiRuleInterpreter(HttpClient httpClient, OpenAiOptions options, IReferenceDataProvider references)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _references = references ?? throw new ArgumentNullException(nameof(references));
    }

    /// <inheritdoc />
    public async Task<InterpretationResult> InterpretAsync(
        string naturalLanguage,
        VocabularyCatalog vocabulary,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(vocabulary);
        if (string.IsNullOrWhiteSpace(naturalLanguage))
            throw new ArgumentException("Natural-language rule text must be provided.", nameof(naturalLanguage));

        // M3: defence-in-depth length guard so the model is never called with an oversized prompt
        // (LLM cost / DoS). The API DTO ([MaxLength(4000)]) rejects most cases first; this protects
        // any non-HTTP caller (Demo / direct use).
        if (naturalLanguage.Length > MaxNaturalLanguageLength)
            throw new ArgumentException(
                $"Natural-language rule text exceeds the maximum of {MaxNaturalLanguageLength} characters.",
                nameof(naturalLanguage));

        if (!_options.Enabled)
            throw new InvalidOperationException("The OpenAI interpreter is disabled (OPENAI_ENABLED=false). Fall back to the offline stub interpreter.");

        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new InvalidOperationException("No OpenAI API key is configured (OPENAI_API_KEY). Fall back to the offline stub interpreter.");

        var envelope = await CallModelAsync(naturalLanguage, vocabulary, cancellationToken).ConfigureAwait(false);

        // Deterministic gate: schema + lint. The model never decides validity on its own.
        var gate = new RuleInterpretationGate(vocabulary, _references);
        return gate.Validate(envelope);
    }

    /// <summary>
    /// Calls OpenAI Chat Completions with strict Structured Outputs and returns the parsed envelope. Errors
    /// (HTTP, timeout, JSON) are surfaced as <see cref="InvalidOperationException"/> with no secret material.
    /// </summary>
    private async Task<ModelEnvelope> CallModelAsync(
        string naturalLanguage,
        VocabularyCatalog vocabulary,
        CancellationToken cancellationToken)
    {
        var requestBody = BuildRequestBody(naturalLanguage, vocabulary);

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildEndpoint())
        {
            Content = JsonContent.Create(requestBody),
        };
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {_options.ApiKey}");

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(_options.TimeoutSeconds));

        HttpResponseMessage response;
        string responseBody;
        try
        {
            response = await _httpClient.SendAsync(request, timeoutCts.Token).ConfigureAwait(false);
            responseBody = await response.Content.ReadAsStringAsync(timeoutCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException($"OpenAI request timed out after {_options.TimeoutSeconds}s.");
        }
        catch (HttpRequestException ex)
        {
            // Message text only; never includes the Authorization header or key.
            throw new InvalidOperationException($"OpenAI request failed: {ex.Message}");
        }

        if (!response.IsSuccessStatusCode)
        {
            // Surface status + provider error text (which does not contain the key), nothing more.
            throw new InvalidOperationException(
                $"OpenAI returned {(int)response.StatusCode} {response.StatusCode}. Provider detail: {Truncate(responseBody, 500)}");
        }

        return ParseEnvelope(responseBody);
    }

    /// <summary>Builds the Chat Completions request body with strict JSON-schema structured output.</summary>
    private object BuildRequestBody(string naturalLanguage, VocabularyCatalog vocabulary)
    {
        var system = RuleInterpretationPrompt.BuildSystemPrompt(vocabulary);
        var user = RuleInterpretationPrompt.BuildUserPrompt(naturalLanguage);

        return new
        {
            model = _options.Model,
            temperature = _options.Temperature,
            messages = new object[]
            {
                new { role = "system", content = system },
                new { role = "user", content = user },
            },
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "vdf_rule_interpretation",
                    strict = true,
                    schema = EnvelopeSchema,
                },
            },
        };
    }

    /// <summary>
    /// The strict JSON schema for the interpretation envelope. The rule is carried as a JSON <em>string</em>
    /// (<c>candidateJson</c>), so the open-ended parts of the rule schema (literal <c>value</c>, free-form
    /// <c>parameters</c>) need not be expressed under strict mode; the deterministic gate validates the rule
    /// against the real rule schema afterwards. Under strict mode every property is required and
    /// <c>additionalProperties</c> is false; <c>candidateJson</c> is nullable.
    /// </summary>
    private static readonly object EnvelopeSchema = new
    {
        type = "object",
        additionalProperties = false,
        required = new[] { "candidateJson", "confidence", "unmappedPhrases", "gaps" },
        properties = new
        {
            candidateJson = new
            {
                type = new[] { "string", "null" },
                description = "The full rule object serialized as a JSON string, or null when the sentence cannot be expressed in the vocabulary.",
            },
            confidence = new
            {
                type = "number",
                description = "Confidence in the candidate, 0..1.",
            },
            unmappedPhrases = new
            {
                type = "array",
                items = new { type = "string" },
                description = "Phrases from the input that could not be mapped to a vocabulary term.",
            },
            gaps = new
            {
                type = "array",
                items = new { type = "string" },
                description = "Missing concepts or clarifications; if non-empty, candidateJson is typically null.",
            },
        },
    };

    private string BuildEndpoint()
    {
        var baseUrl = _options.BaseUrl.TrimEnd('/');
        return $"{baseUrl}/chat/completions";
    }

    /// <summary>Extracts the assistant message content and parses it into a <see cref="ModelEnvelope"/>.</summary>
    private static ModelEnvelope ParseEnvelope(string responseBody)
    {
        JsonNode? root;
        try
        {
            root = JsonNode.Parse(responseBody);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"OpenAI response was not valid JSON: {ex.Message}");
        }

        var content = root?["choices"]?[0]?["message"]?["content"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("OpenAI response did not contain message content.");

        try
        {
            return JsonSerializer.Deserialize<ModelEnvelope>(content!)
                   ?? throw new InvalidOperationException("OpenAI structured output deserialized to null.");
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"OpenAI structured output did not match the envelope schema: {ex.Message}");
        }
    }

    private static string Truncate(string value, int max)
        => string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max] + "…";
}
