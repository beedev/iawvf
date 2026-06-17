using System.Text.Json.Nodes;
using Json.Schema;

namespace IAW.Vdf.Authoring.Schema;

/// <summary>Represents a single schema validation error at a given JSON path.</summary>
/// <param name="Path">The JSON Pointer path to the offending node.</param>
/// <param name="Message">Human-readable description of the violation.</param>
public sealed record SchemaError(string Path, string Message);

/// <summary>
/// Validates a rule's JSON representation against the embedded <c>rule.schema.json</c>
/// (draft-2020-12). Used before deserialization to provide detailed structural feedback.
/// </summary>
public sealed class SchemaValidator
{
    private readonly JsonSchema _schema;

    /// <summary>Initializes a new <see cref="SchemaValidator"/>, loading the embedded schema.</summary>
    public SchemaValidator()
    {
        var assembly = typeof(SchemaValidator).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .First(n => n.EndsWith("rule.schema.json", StringComparison.OrdinalIgnoreCase));

        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded resource '{resourceName}' not found.");

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        _schema = JsonSchema.FromText(json);
    }

    /// <summary>
    /// Validates the supplied JSON string against the rule schema.
    /// </summary>
    /// <param name="ruleJson">The JSON text to validate.</param>
    /// <returns>
    /// An empty list when the JSON is valid; otherwise a list of <see cref="SchemaError"/>
    /// records describing each violation.
    /// </returns>
    public IReadOnlyList<SchemaError> Validate(string ruleJson)
    {
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(ruleJson);
        }
        catch (Exception ex)
        {
            return new[] { new SchemaError("", $"Invalid JSON: {ex.Message}") };
        }

        if (node is null)
            return new[] { new SchemaError("", "JSON parsed to null.") };

        var options = new EvaluationOptions
        {
            OutputFormat = OutputFormat.List,
            RequireFormatValidation = false
        };

        var results = _schema.Evaluate(node, options);

        if (results.IsValid)
            return Array.Empty<SchemaError>();

        var errors = new List<SchemaError>();
        CollectErrors(results, errors);
        return errors;
    }

    private static void CollectErrors(EvaluationResults results, List<SchemaError> errors)
    {
        if (!results.IsValid)
        {
            if (results.Errors is not null)
            {
                foreach (var (keyword, message) in results.Errors)
                {
                    var path = results.InstanceLocation?.ToString() ?? "";
                    errors.Add(new SchemaError(path, $"{keyword}: {message}"));
                }
            }

            if (results.Details is not null)
            {
                foreach (var detail in results.Details)
                {
                    CollectErrors(detail, errors);
                }
            }
        }
    }
}
