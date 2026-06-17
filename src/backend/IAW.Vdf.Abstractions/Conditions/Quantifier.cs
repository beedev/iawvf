namespace IAW.Vdf.Abstractions.Conditions;

/// <summary>
/// Determines how a leaf condition applies to a subject that may resolve to multiple values
/// (a collection path ending in <c>[]</c>).
/// </summary>
public enum Quantifier
{
    /// <summary>Scalar subject: the (single) resolved value must satisfy the operator. The default.</summary>
    This,

    /// <summary>Collection subject: at least one element must satisfy the operator.</summary>
    Any,

    /// <summary>Collection subject: every element must satisfy the operator.</summary>
    Every,
}

/// <summary>The boolean combinator used by a group condition.</summary>
public enum LogicalOperator
{
    /// <summary>All child conditions must be true (logical AND).</summary>
    All,

    /// <summary>At least one child condition must be true (logical OR).</summary>
    Any,

    /// <summary>The (single) child condition must be false (logical NOT).</summary>
    Not,
}
