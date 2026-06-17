using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Abstractions.Conditions;

/// <summary>
/// A node in a rule's boolean condition tree. Implemented by <see cref="LeafCondition"/> (an operator
/// applied to a subject) and <see cref="GroupCondition"/> (a recursive All/Any/Not combinator).
/// </summary>
public interface ICondition
{
    /// <summary>
    /// Evaluates the condition against the supplied facts and reference data, appending one
    /// <see cref="ConditionTrace"/> per leaf comparison to <paramref name="trace"/>.
    /// </summary>
    /// <param name="facts">The fact substrate.</param>
    /// <param name="references">The reference-data provider for reference-backed operators.</param>
    /// <param name="trace">The trace sink to record leaf evaluations into.</param>
    /// <returns>The boolean result of the condition.</returns>
    bool Evaluate(FactDocument facts, IReferenceDataProvider references, ConditionTraceSink trace);
}
