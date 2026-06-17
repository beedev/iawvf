using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;

namespace IAW.Vdf.Abstractions.Vocabulary;

/// <summary>A legal subject (fact path) together with its expected data type.</summary>
/// <param name="Path">The dotted fact path.</param>
/// <param name="DataType">The expected data type for the subject.</param>
public readonly record struct SubjectDefinition(string Path, SubjectDataType DataType);

/// <summary>The data types a subject may hold.</summary>
public enum SubjectDataType
{
    /// <summary>A textual value (also covers enum-as-string).</summary>
    String,

    /// <summary>A numeric value.</summary>
    Number,

    /// <summary>A date / timestamp value.</summary>
    Date,

    /// <summary>A boolean value.</summary>
    Boolean,

    /// <summary>A collection of elements (addressed with <c>[]</c>).</summary>
    Collection,
}

/// <summary>
/// The controlled vocabulary the engine grounds against: the legal subjects (fact paths + types),
/// operators, reference keys, and outcome types. The linter (M3) and interpreter (M4) validate
/// authored rules against this catalog. Build with <see cref="Builder"/> or use <see cref="Default"/>.
/// </summary>
public sealed class VocabularyCatalog
{
    private readonly Dictionary<string, SubjectDefinition> _subjects;
    private readonly HashSet<OperatorKind> _operators;
    private readonly HashSet<string> _references;
    private readonly HashSet<OutcomeType> _outcomes;

    private VocabularyCatalog(
        Dictionary<string, SubjectDefinition> subjects,
        HashSet<OperatorKind> operators,
        HashSet<string> references,
        HashSet<OutcomeType> outcomes)
    {
        _subjects = subjects;
        _operators = operators;
        _references = references;
        _outcomes = outcomes;
    }

    /// <summary>The known subjects.</summary>
    public IReadOnlyCollection<SubjectDefinition> Subjects => _subjects.Values;

    /// <summary>The known operators.</summary>
    public IReadOnlyCollection<OperatorKind> Operators => _operators;

    /// <summary>The known reference keys.</summary>
    public IReadOnlyCollection<string> References => _references;

    /// <summary>The known outcome types.</summary>
    public IReadOnlyCollection<OutcomeType> Outcomes => _outcomes;

    /// <summary>Determines whether a subject path is known.</summary>
    /// <param name="path">The subject path.</param>
    /// <returns><see langword="true"/> if known.</returns>
    public bool IsKnownSubject(string path) => _subjects.ContainsKey(path);

    /// <summary>Attempts to get a subject's definition.</summary>
    /// <param name="path">The subject path.</param>
    /// <param name="definition">The resolved definition.</param>
    /// <returns><see langword="true"/> if known.</returns>
    public bool TryGetSubject(string path, out SubjectDefinition definition) => _subjects.TryGetValue(path, out definition);

    /// <summary>Determines whether an operator is known.</summary>
    /// <param name="op">The operator.</param>
    /// <returns><see langword="true"/> if known.</returns>
    public bool IsKnownOperator(OperatorKind op) => _operators.Contains(op);

    /// <summary>Determines whether a reference key is known.</summary>
    /// <param name="key">The reference key.</param>
    /// <returns><see langword="true"/> if known.</returns>
    public bool IsKnownReference(string key) => _references.Contains(key);

    /// <summary>Determines whether an outcome type is known.</summary>
    /// <param name="type">The outcome type.</param>
    /// <returns><see langword="true"/> if known.</returns>
    public bool IsKnownOutcome(OutcomeType type) => _outcomes.Contains(type);

    /// <summary>Starts building a vocabulary catalog.</summary>
    /// <returns>A new builder.</returns>
    public static Builder CreateBuilder() => new();

    /// <summary>
    /// The default catalog, seeded with the subjects, references, and outcomes exercised by the ten
    /// reference rules (PM17, PM48, PM13, BL8, BL27, BL20, BL3, BL46, PM49, BL36). All operators and all
    /// outcome types are registered.
    /// </summary>
    /// <returns>The default vocabulary catalog.</returns>
    public static VocabularyCatalog Default()
    {
        var builder = CreateBuilder();

        // Subjects used across the ten reference rules.
        builder
            .AddSubject("test.code", SubjectDataType.String)
            .AddSubject("test.specimen.type", SubjectDataType.String)
            .AddSubject("test.specimen", SubjectDataType.String)
            .AddSubject("test.orderedTest", SubjectDataType.String)
            .AddSubject("test.priority", SubjectDataType.String)
            .AddSubject("test.capGoverned", SubjectDataType.Boolean)
            .AddSubject("document.circledHE", SubjectDataType.String)
            .AddSubject("specimen.age", SubjectDataType.Number)
            .AddSubject("specimen.type", SubjectDataType.String)
            .AddSubject("specimen.bodySite", SubjectDataType.String)
            .AddSubject("specimen.archiveRetrievalDate", SubjectDataType.Date)
            .AddSubject("specimen.fixationTime", SubjectDataType.Number)
            .AddSubject("patient.age", SubjectDataType.Number)
            .AddSubject("patient.gender", SubjectDataType.String)
            .AddSubject("order.type", SubjectDataType.String)
            .AddSubject("order.product", SubjectDataType.String)
            .AddSubject("order.timepoint", SubjectDataType.String)
            .AddSubject("order.client.nyStatus", SubjectDataType.String)
            .AddSubject("order.performingLab", SubjectDataType.String)
            .AddSubject("order.tests[]", SubjectDataType.Collection)
            .AddSubject("order.specimens[]", SubjectDataType.Collection);

        // All operators are part of the closed vocabulary.
        foreach (var op in Enum.GetValues<OperatorKind>())
        {
            builder.AddOperator(op);
        }

        // Reference keys.
        builder
            .AddReference("PolicyThresholds.archiveAgeDays")
            .AddReference("PolicyThresholds.pediatricAge")
            .AddReference("PolicyThresholds.fixationWindow")
            .AddReference("PolicyDefaults.fallbackGender")
            .AddReference("TestCompendium")
            .AddReference("TestCompendium.nyValidation")
            .AddReference("TechnicalFISH")
            .AddReference("PatientHistory");

        // All outcome types are part of the closed vocabulary.
        foreach (var outcome in Enum.GetValues<OutcomeType>())
        {
            builder.AddOutcome(outcome);
        }

        return builder.Build();
    }

    /// <summary>Fluent builder for <see cref="VocabularyCatalog"/>.</summary>
    public sealed class Builder
    {
        private readonly Dictionary<string, SubjectDefinition> _subjects = new(StringComparer.Ordinal);
        private readonly HashSet<OperatorKind> _operators = new();
        private readonly HashSet<string> _references = new(StringComparer.Ordinal);
        private readonly HashSet<OutcomeType> _outcomes = new();

        /// <summary>Registers a subject.</summary>
        /// <param name="path">The subject path.</param>
        /// <param name="dataType">The subject data type.</param>
        /// <returns>The builder.</returns>
        public Builder AddSubject(string path, SubjectDataType dataType)
        {
            _subjects[path] = new SubjectDefinition(path, dataType);
            return this;
        }

        /// <summary>Registers an operator.</summary>
        /// <param name="op">The operator.</param>
        /// <returns>The builder.</returns>
        public Builder AddOperator(OperatorKind op)
        {
            _operators.Add(op);
            return this;
        }

        /// <summary>Registers a reference key.</summary>
        /// <param name="key">The reference key.</param>
        /// <returns>The builder.</returns>
        public Builder AddReference(string key)
        {
            _references.Add(key);
            return this;
        }

        /// <summary>Registers an outcome type.</summary>
        /// <param name="type">The outcome type.</param>
        /// <returns>The builder.</returns>
        public Builder AddOutcome(OutcomeType type)
        {
            _outcomes.Add(type);
            return this;
        }

        /// <summary>Builds the catalog.</summary>
        /// <returns>A new <see cref="VocabularyCatalog"/>.</returns>
        public VocabularyCatalog Build() => new(_subjects, _operators, _references, _outcomes);
    }
}
