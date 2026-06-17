using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.ReferenceData;

namespace IAW.Vdf.Core.Operators;

/// <summary>An injectable evaluator for individual operators. Delegates to <see cref="OperatorSemantics"/>.</summary>
public interface IOperatorEvaluator
{
    /// <summary>Evaluates a single operator.</summary>
    /// <param name="op">The operator.</param>
    /// <param name="left">The subject value.</param>
    /// <param name="right">The comparand (literal or reference-resolved).</param>
    /// <param name="references">The reference-data provider.</param>
    /// <param name="referenceKey">The reference key, when reference-backed.</param>
    /// <returns>The boolean result.</returns>
    bool Evaluate(OperatorKind op, JsonNode? left, JsonNode? right, IReferenceDataProvider references, string? referenceKey = null);
}

/// <summary>The default operator evaluator, implementing every <see cref="OperatorKind"/> via <see cref="OperatorSemantics"/>.</summary>
public sealed class OperatorEvaluator : IOperatorEvaluator
{
    /// <inheritdoc />
    public bool Evaluate(OperatorKind op, JsonNode? left, JsonNode? right, IReferenceDataProvider references, string? referenceKey = null)
        => OperatorSemantics.Evaluate(op, left, right, references, referenceKey);
}
