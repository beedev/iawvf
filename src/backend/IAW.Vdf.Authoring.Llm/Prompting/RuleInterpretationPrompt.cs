using System.Text;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Vocabulary;

namespace IAW.Vdf.Authoring.Llm.Prompting;

/// <summary>
/// Builds the grounding system prompt and the user prompt for the OpenAI rule interpreter. The system
/// prompt enumerates the <em>live</em> <see cref="VocabularyCatalog"/> — the legal subjects (with data
/// types), operators, reference keys, and outcome types — and constrains the model to produce a rule that
/// uses only those terms. Per the HLD's "grounding, not guessing" principle (§4), the model must surface a
/// gap rather than invent a term the vocabulary lacks.
/// </summary>
public static class RuleInterpretationPrompt
{
    /// <summary>
    /// Builds the system prompt that grounds the model in the supplied catalog. Deterministic for a given
    /// catalog (terms are emitted in a stable, sorted order).
    /// </summary>
    /// <param name="vocabulary">The live vocabulary to ground against.</param>
    /// <returns>The system prompt text.</returns>
    public static string BuildSystemPrompt(VocabularyCatalog vocabulary)
    {
        ArgumentNullException.ThrowIfNull(vocabulary);

        var sb = new StringBuilder();
        sb.AppendLine("You are the rule-interpretation front-end of a regulated clinical accessioning validation engine.");
        sb.AppendLine("You translate a single plain-English rule into ONE structured rule expressed strictly in a CLOSED controlled vocabulary.");
        sb.AppendLine();
        sb.AppendLine("ABSOLUTE RULES (no exceptions):");
        sb.AppendLine("1. GROUNDING, NOT GUESSING. Use ONLY the subjects, operators, reference keys, and outcome types listed below.");
        sb.AppendLine("2. NO SILENT INVENTION. If the sentence needs a concept the vocabulary does not contain (a subject, operator, reference, or outcome that is NOT in the lists), you MUST NOT fabricate it. Instead, set \"candidateJson\" to null, lower the confidence, and add a precise entry to \"gaps\" naming the missing concept (e.g. \"No subject models 'cold-ischemia time'.\").");
        sb.AppendLine("3. Any phrase you could not map to a vocabulary term goes in \"unmappedPhrases\".");
        sb.AppendLine("4. Prefer asking (a gap) over assuming. When in doubt, do not produce a candidate.");
        sb.AppendLine();
        sb.AppendLine("LEGAL SUBJECTS (fact paths and their data types) — use these exact paths:");
        foreach (var subject in vocabulary.Subjects.OrderBy(s => s.Path, StringComparer.Ordinal))
        {
            sb.Append("  - ").Append(subject.Path).Append(" : ").AppendLine(subject.DataType.ToString());
        }
        sb.AppendLine();
        sb.AppendLine("LEGAL OPERATORS (OperatorKind) — use these exact names:");
        foreach (var op in vocabulary.Operators.OrderBy(o => o.ToString(), StringComparer.Ordinal))
        {
            sb.Append("  - ").AppendLine(op.ToString());
        }
        sb.AppendLine();
        sb.AppendLine("LEGAL REFERENCE KEYS (for reference-backed comparands) — use these exact keys:");
        foreach (var reference in vocabulary.References.OrderBy(r => r, StringComparer.Ordinal))
        {
            sb.Append("  - ").AppendLine(reference);
        }
        sb.AppendLine();
        sb.AppendLine("LEGAL OUTCOME TYPES (OutcomeType) — use these exact names:");
        foreach (var outcome in vocabulary.Outcomes.OrderBy(o => o.ToString(), StringComparer.Ordinal))
        {
            sb.Append("  - ").AppendLine(outcome.ToString());
        }
        sb.AppendLine();
        sb.AppendLine("RULE SHAPE. The rule is the four-part anatomy WHEN + DECISION + ON SUCCESS + ON FAILURE:");
        sb.AppendLine("  - \"appliesWhen\": optional guard condition; the rule only runs when this is true.");
        sb.AppendLine("  - \"assert\": optional condition that must hold for success; its failure triggers \"onFailure\".");
        sb.AppendLine("  - \"onSuccess\": outcome when the assertion passes (usually {\"type\":\"Continue\"}).");
        sb.AppendLine("  - \"onFailure\": REQUIRED outcome when the assertion fails (the business effect: hold, alert, prevent, route, derive, ...).");
        sb.AppendLine();
        sb.AppendLine("CONDITION SHAPE (JSON):");
        sb.AppendLine("  - leaf:  {\"type\":\"leaf\",\"subject\":\"<path>\",\"operator\":\"<OperatorKind>\",\"value\":<literal>|\"reference\":\"<key>\",\"quantifier\":\"This\"|\"Any\"|\"Every\"}");
        sb.AppendLine("  - group: {\"type\":\"group\",\"logicalOp\":\"All\"|\"Any\"|\"Not\",\"conditions\":[ ... ]}");
        sb.AppendLine("  Use \"value\" for an inline literal OR \"reference\" for a reference-data key, never both.");
        sb.AppendLine();
        sb.AppendLine("OUTCOME SHAPE (JSON): {\"type\":\"<OutcomeType>\",\"scope\":\"order\"|\"test\"|\"specimen\",\"reason\":\"...\",\"parameters\":{...}}");
        sb.AppendLine("  Parameter requirements: PreventAction/AllowAction need {\"Action\":\"...\"}; RouteToReview/RouteToQueue need {\"Destination\":\"...\"}; CreatePlaceholder needs {\"SpecimenType\":\"...\"}; SetValue/ApplyDefault/CalculateValue need {\"Target\":\"...\",\"Value\":...}.");
        sb.AppendLine();
        sb.AppendLine("OUTPUT. Respond with a single JSON object exactly matching this envelope (no prose, no markdown):");
        sb.AppendLine("  {");
        sb.AppendLine("    \"candidateJson\": <a JSON-as-string of the full rule object, or null if it cannot be expressed>,");
        sb.AppendLine("    \"confidence\": <number 0..1>,");
        sb.AppendLine("    \"unmappedPhrases\": [<strings>],");
        sb.AppendLine("    \"gaps\": [<strings>]");
        sb.AppendLine("  }");
        sb.AppendLine("The rule object inside \"candidateJson\" MUST include at least \"key\", \"name\", and \"onFailure\". Choose a short uppercase \"key\" if none is implied (e.g. \"NL1\").");
        return sb.ToString();
    }

    /// <summary>Builds the user prompt carrying the author's natural-language rule.</summary>
    /// <param name="naturalLanguage">The author's plain-English rule.</param>
    /// <returns>The user prompt text.</returns>
    public static string BuildUserPrompt(string naturalLanguage)
    {
        var trimmed = (naturalLanguage ?? string.Empty).Trim();
        return $"Interpret this rule into the controlled vocabulary:\n\n\"{trimmed}\"";
    }
}
