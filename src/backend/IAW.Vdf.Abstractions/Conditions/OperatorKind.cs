namespace IAW.Vdf.Abstractions.Conditions;

/// <summary>
/// The closed vocabulary of leaf-condition operators, grouped into six families. This set is the heart
/// of the engine: every rule condition is expressed by recombining these operators with subjects,
/// references, and quantifiers.
/// </summary>
public enum OperatorKind
{
    // --- Presence family ---

    /// <summary>True when the subject path resolves to a non-null value.</summary>
    IsPresent,

    /// <summary>True when the subject path is missing or null.</summary>
    IsAbsent,

    // --- Equality family ---

    /// <summary>True when the subject value equals the comparand (type-coerced).</summary>
    Equals,

    /// <summary>True when the subject value does not equal the comparand.</summary>
    NotEquals,

    // --- Membership family ---

    /// <summary>True when the subject value is a member of the comparand set.</summary>
    InSet,

    /// <summary>True when the subject value is not a member of the comparand set.</summary>
    NotInSet,

    // --- Comparison family ---

    /// <summary>True when the subject is strictly greater than the comparand (decimal or date).</summary>
    GreaterThan,

    /// <summary>True when the subject is strictly less than the comparand (decimal or date).</summary>
    LessThan,

    /// <summary>True when the subject is greater than or equal to the comparand.</summary>
    GreaterOrEqual,

    /// <summary>True when the subject is less than or equal to the comparand.</summary>
    LessOrEqual,

    /// <summary>True when the subject falls within the inclusive <c>{ min, max }</c> comparand range.</summary>
    WithinRange,

    // --- Matching family (may be reference-backed) ---

    /// <summary>True when the subject matches the comparand pattern / compatibility set.</summary>
    Matches,

    /// <summary>True when the subject is compatible with the comparand per reference data.</summary>
    IsCompatibleWith,

    // --- Reference-eligibility family (reference-backed) ---

    /// <summary>True when the subject is eligible for the comparand per reference data.</summary>
    IsEligibleFor,

    /// <summary>True when a reference-backed lookup confirms existence of the comparand.</summary>
    Exists,
}
