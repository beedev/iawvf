using System.Text.Json.Serialization;

namespace IAW.Vdf.Authoring.Llm.Interpretation;

/// <summary>
/// The raw structured-output envelope the model returns. The rule itself is carried as a JSON string in
/// <see cref="CandidateJson"/> (rather than an inline object) so the deterministic gate can schema-validate
/// and lint it with the existing M3 tooling before it is ever treated as a real rule. A <see langword="null"/>
/// or empty <see cref="CandidateJson"/> means the model declined to produce a candidate (a gap).
/// </summary>
public sealed class ModelEnvelope
{
    /// <summary>The full rule object serialized as a JSON string, or <see langword="null"/> when no candidate.</summary>
    [JsonPropertyName("candidateJson")]
    public string? CandidateJson { get; set; }

    /// <summary>The model's self-reported confidence in the candidate, 0..1.</summary>
    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    /// <summary>Phrases from the input the model could not map to the vocabulary.</summary>
    [JsonPropertyName("unmappedPhrases")]
    public List<string> UnmappedPhrases { get; set; } = new();

    /// <summary>Gaps the model surfaced (missing concepts / clarifications needed).</summary>
    [JsonPropertyName("gaps")]
    public List<string> Gaps { get; set; } = new();
}
