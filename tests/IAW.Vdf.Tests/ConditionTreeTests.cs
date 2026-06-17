using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Tracing;
using IAW.Vdf.Core.ReferenceData;

namespace IAW.Vdf.Tests;

/// <summary>Tests the recursive boolean tree (All/Any/Not) and collection quantifiers (Any/Every).</summary>
public sealed class ConditionTreeTests
{
    private readonly InMemoryReferenceDataProvider _refs = new();

    private bool Evaluate(ICondition condition, FactDocument facts)
        => condition.Evaluate(facts, _refs, new ConditionTraceSink());

    private static FactDocument Facts(string json) => FactDocument.Parse(json);

    [Fact]
    public void All_requires_every_child_true()
    {
        var facts = Facts("""{ "a": 1, "b": 2 }""");
        var cond = GroupCondition.All(
            LeafCondition.Literal("a", OperatorKind.Equals, JsonValue.Create(1)),
            LeafCondition.Literal("b", OperatorKind.Equals, JsonValue.Create(2)));
        Evaluate(cond, facts).Should().BeTrue();

        var fail = GroupCondition.All(
            LeafCondition.Literal("a", OperatorKind.Equals, JsonValue.Create(1)),
            LeafCondition.Literal("b", OperatorKind.Equals, JsonValue.Create(99)));
        Evaluate(fail, facts).Should().BeFalse();
    }

    [Fact]
    public void Any_requires_at_least_one_true()
    {
        var facts = Facts("""{ "a": 1, "b": 2 }""");
        var cond = GroupCondition.Any(
            LeafCondition.Literal("a", OperatorKind.Equals, JsonValue.Create(99)),
            LeafCondition.Literal("b", OperatorKind.Equals, JsonValue.Create(2)));
        Evaluate(cond, facts).Should().BeTrue();
    }

    [Fact]
    public void Not_negates_child()
    {
        var facts = Facts("""{ "a": 1 }""");
        var cond = GroupCondition.Not(LeafCondition.Literal("a", OperatorKind.Equals, JsonValue.Create(99)));
        Evaluate(cond, facts).Should().BeTrue();
    }

    [Fact]
    public void Nested_tree_evaluates_correctly()
    {
        var facts = Facts("""{ "a": 1, "b": 2, "c": 3 }""");
        var cond = GroupCondition.All(
            LeafCondition.Literal("a", OperatorKind.Equals, JsonValue.Create(1)),
            GroupCondition.Any(
                LeafCondition.Literal("b", OperatorKind.Equals, JsonValue.Create(0)),
                LeafCondition.Literal("c", OperatorKind.Equals, JsonValue.Create(3))));
        Evaluate(cond, facts).Should().BeTrue();
    }

    [Fact]
    public void Quantifier_Any_over_collection()
    {
        var facts = Facts("""{ "order": { "tests": [ { "code": "A" }, { "code": "B" } ] } }""");
        var any = LeafCondition.Literal("order.tests[].code", OperatorKind.Equals, JsonValue.Create("B"), Quantifier.Any);
        Evaluate(any, facts).Should().BeTrue();

        var none = LeafCondition.Literal("order.tests[].code", OperatorKind.Equals, JsonValue.Create("Z"), Quantifier.Any);
        Evaluate(none, facts).Should().BeFalse();
    }

    [Fact]
    public void Quantifier_Every_over_collection()
    {
        var facts = Facts("""{ "order": { "tests": [ { "type": "FFPE" }, { "type": "FFPE" } ] } }""");
        var every = LeafCondition.Literal("order.tests[].type", OperatorKind.Equals, JsonValue.Create("FFPE"), Quantifier.Every);
        Evaluate(every, facts).Should().BeTrue();

        var mixed = Facts("""{ "order": { "tests": [ { "type": "FFPE" }, { "type": "Fresh" } ] } }""");
        Evaluate(every, mixed).Should().BeFalse();
    }
}
