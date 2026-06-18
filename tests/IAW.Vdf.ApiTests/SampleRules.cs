namespace IAW.Vdf.ApiTests;

/// <summary>Canonical rule JSON payloads used across the API tests.</summary>
internal static class SampleRules
{
    /// <summary>
    /// A well-formed PM17-style rule (parameterised key) that passes the vocabulary linter: Technical
    /// FISH on FFPE requires a circled H&amp;E slide, else CompleteHold.
    /// </summary>
    public static string Pm17Json(string key) => $$"""
    {
      "key": "{{key}}",
      "name": "Circled H&E required for Technical FISH on FFPE",
      "description": "A circled H&E slide must be present when a Technical FISH test is ordered on an FFPE specimen.",
      "priority": 10,
      "phase": "Validate",
      "enabled": true,
      "version": 1,
      "effectiveDate": "0001-01-01T00:00:00+00:00",
      "appliesWhen": {
        "type": "group",
        "logicalOp": "All",
        "conditions": [
          { "type": "leaf", "subject": "test.code", "operator": "InSet", "reference": "TechnicalFISH" },
          { "type": "leaf", "subject": "test.specimen.type", "operator": "Equals", "value": "FFPE" }
        ]
      },
      "assert": { "type": "leaf", "subject": "document.circledHE", "operator": "IsPresent" },
      "onSuccess": { "type": "Continue" },
      "onFailure": {
        "type": "CompleteHold",
        "scope": "order",
        "reason": "Circled H&E not present for Technical FISH on FFPE"
      }
    }
    """;

    /// <summary>
    /// A well-formed PM17-style rule (parameterised key) that additionally carries an author-declared
    /// <c>scope</c> block (objects + properties). Used to verify the scope survives POST → persistence →
    /// GET. The scope correctly covers the subjects PM17 references (<c>test.*</c> and <c>document.*</c>).
    /// </summary>
    public static string Pm17WithScopeJson(string key) => $$"""
    {
      "key": "{{key}}",
      "name": "Circled H&E required for Technical FISH on FFPE",
      "description": "A circled H&E slide must be present when a Technical FISH test is ordered on an FFPE specimen.",
      "priority": 10,
      "phase": "Validate",
      "enabled": true,
      "version": 1,
      "effectiveDate": "0001-01-01T00:00:00+00:00",
      "appliesWhen": {
        "type": "group",
        "logicalOp": "All",
        "conditions": [
          { "type": "leaf", "subject": "test.code", "operator": "InSet", "reference": "TechnicalFISH" },
          { "type": "leaf", "subject": "test.specimen.type", "operator": "Equals", "value": "FFPE" }
        ]
      },
      "assert": { "type": "leaf", "subject": "document.circledHE", "operator": "IsPresent" },
      "onSuccess": { "type": "Continue" },
      "onFailure": {
        "type": "CompleteHold",
        "scope": "order",
        "reason": "Circled H&E not present for Technical FISH on FFPE"
      },
      "scope": {
        "objects": ["test", "document"],
        "properties": ["test.code", "test.specimen.type", "document.circledHE"]
      }
    }
    """;

    /// <summary>
    /// An invalid rule whose assert references an unknown subject path, which the linter flags as
    /// LINT001 (Error).
    /// </summary>
    public static string InvalidUnknownSubject() => """
    {
      "key": "API_TEST_INVALID",
      "name": "Invalid rule with unknown subject",
      "priority": 10,
      "phase": "Validate",
      "enabled": true,
      "version": 1,
      "effectiveDate": "0001-01-01T00:00:00+00:00",
      "assert": { "type": "leaf", "subject": "patient.totallyUnknownField", "operator": "IsPresent" },
      "onSuccess": { "type": "Continue" },
      "onFailure": { "type": "CompleteHold", "scope": "order", "reason": "missing" }
    }
    """;
}
