using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Abstractions.Conditions;

/// <summary>
/// A terminal condition: an <see cref="OperatorKind"/> applied to a subject path, comparing against
/// either an inline literal (<see cref="Value"/>) or a reference-data value (<see cref="Reference"/>),
/// optionally over a collection via a <see cref="Quantifier"/>.
/// </summary>
public sealed class LeafCondition : ICondition
{
    /// <summary>The fact path the condition reads (e.g. <c>"specimen.age"</c>).</summary>
    public required string Subject { get; init; }

    /// <summary>The operator to apply.</summary>
    public required OperatorKind Operator { get; init; }

    /// <summary>An inline literal comparand. Mutually exclusive with <see cref="Reference"/>.</summary>
    public JsonNode? Value { get; init; }

    /// <summary>A reference key whose resolved value is the comparand. Mutually exclusive with <see cref="Value"/>.</summary>
    public string? Reference { get; init; }

    /// <summary>How the operator applies across a collection subject. Defaults to <see cref="Quantifier.This"/>.</summary>
    public Quantifier Quantifier { get; init; } = Quantifier.This;

    /// <summary>Convenience factory for a literal-comparand leaf condition.</summary>
    /// <param name="subject">The subject path.</param>
    /// <param name="op">The operator.</param>
    /// <param name="value">The literal comparand.</param>
    /// <param name="quantifier">The quantifier.</param>
    /// <returns>A new leaf condition.</returns>
    public static LeafCondition Literal(string subject, OperatorKind op, JsonNode? value = null, Quantifier quantifier = Quantifier.This)
        => new() { Subject = subject, Operator = op, Value = value, Quantifier = quantifier };

    /// <summary>Convenience factory for a reference-backed leaf condition.</summary>
    /// <param name="subject">The subject path.</param>
    /// <param name="op">The operator.</param>
    /// <param name="referenceKey">The reference key.</param>
    /// <param name="quantifier">The quantifier.</param>
    /// <returns>A new leaf condition.</returns>
    public static LeafCondition Ref(string subject, OperatorKind op, string referenceKey, Quantifier quantifier = Quantifier.This)
        => new() { Subject = subject, Operator = op, Reference = referenceKey, Quantifier = quantifier };

    /// <inheritdoc />
    public bool Evaluate(FactDocument facts, IReferenceDataProvider references, ConditionTraceSink trace)
    {
        var right = ResolveComparand(references);

        bool result;
        string? leftRendering;

        if (Quantifier == Quantifier.This)
        {
            var left = facts.Resolve(Subject);
            leftRendering = FactDocument.CoerceString(left);
            result = OperatorSemantics.Evaluate(Operator, left, right, references, Reference);
        }
        else
        {
            var elements = facts.ResolveAll(Subject);
            leftRendering = $"[{elements.Count} element(s)]";

            if (Quantifier == Quantifier.Any)
            {
                result = elements.Any(e => OperatorSemantics.Evaluate(Operator, e, right, references, Reference));
            }
            else // Every
            {
                result = elements.Count > 0 &&
                         elements.All(e => OperatorSemantics.Evaluate(Operator, e, right, references, Reference));
            }
        }

        trace.Add(new ConditionTrace
        {
            Subject = Subject,
            Operator = Operator,
            Quantifier = Quantifier,
            ResolvedLeft = leftRendering,
            ResolvedRight = Reference is not null ? $"ref:{Reference}={FactDocument.CoerceString(right)}" : FactDocument.CoerceString(right),
            Result = result,
        });

        return result;
    }

    private JsonNode? ResolveComparand(IReferenceDataProvider references)
    {
        if (Reference is not null)
        {
            return references.Resolve(Reference);
        }

        // JsonNode instances are single-parented; clone the literal so it can be safely reused.
        return Value is null ? null : JsonNode.Parse(Value.ToJsonString());
    }
}
