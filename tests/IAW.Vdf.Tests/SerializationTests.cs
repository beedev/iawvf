using System.Text.Json;
using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Serialization;

namespace IAW.Vdf.Tests;

/// <summary>Verifies a rule (with its polymorphic condition tree and parameterised outcomes) round-trips object → JSON → object.</summary>
public sealed class SerializationTests
{
    [Fact]
    public void Pm17_round_trips_losslessly()
    {
        var original = TestHelpers.Pm17();

        var json = RuleSerializer.Serialize(original);
        var restored = RuleSerializer.Deserialize(json);

        restored.Key.Should().Be("PM17");
        restored.Phase.Should().Be(RulePhase.Validate);
        restored.OnFailure.Type.Should().Be(OutcomeType.CompleteHold);
        restored.OnFailure.Scope.Should().Be("order");

        // AppliesWhen is an All group with two leaf conditions.
        var group = restored.AppliesWhen.Should().BeOfType<GroupCondition>().Subject;
        group.LogicalOp.Should().Be(LogicalOperator.All);
        group.Conditions.Should().HaveCount(2);
        group.Conditions[0].Should().BeOfType<LeafCondition>()
            .Which.Operator.Should().Be(OperatorKind.InSet);

        // Assert is a presence leaf.
        restored.Assert.Should().BeOfType<LeafCondition>()
            .Which.Operator.Should().Be(OperatorKind.IsPresent);
    }

    [Fact]
    public void Bl27_recovery_round_trips()
    {
        var original = TestHelpers.Bl27();

        var json = RuleSerializer.Serialize(original);
        var restored = RuleSerializer.Deserialize(json);

        restored.Recover.Should().NotBeNull();
        restored.Recover!.Strategy.Should().Be(RecoveryStrategy.ApplyDefault);
        restored.Recover.Parameters["Target"].Should().Be("patient.gender");
        restored.Recover.Parameters["Reference"].Should().Be("PolicyDefaults.fallbackGender");
        restored.OnFailure.Type.Should().Be(OutcomeType.Suppressed);
    }

    [Fact]
    public void Bl3_derivation_outcome_round_trips()
    {
        var original = TestHelpers.Bl3();

        var json = RuleSerializer.Serialize(original);
        var restored = RuleSerializer.Deserialize(json);

        restored.Assert.Should().BeNull();
        restored.Phase.Should().Be(RulePhase.Derive);
        restored.OnFailure.Type.Should().Be(OutcomeType.SetValue);
        restored.OnFailure.Parameters["Target"].Should().Be("test.priority");
        restored.OnFailure.Parameters["Value"].Should().Be("Pediatric");
    }

    [Fact]
    public void Many_rules_round_trip_as_array()
    {
        var rules = new[] { TestHelpers.Pm17(), TestHelpers.Pm48(), TestHelpers.Bl3(), TestHelpers.Bl27() };

        var json = RuleSerializer.SerializeMany(rules);
        var restored = RuleSerializer.DeserializeMany(json);

        restored.Select(r => r.Key).Should().Equal("PM17", "PM48", "BL3", "BL27");
    }

    [Fact]
    public void Rule_with_scope_serializes_shape_and_round_trips()
    {
        var original = new RuleDefinition
        {
            Key = "SCOPE-1",
            Name = "Scoped rule",
            Phase = RulePhase.Validate,
            Assert = LeafCondition.Literal("specimen.age", OperatorKind.IsPresent),
            OnFailure = Outcome.Warning("order", "missing"),
            Scope = new RuleScope(
                Objects: new[] { "specimen" },
                Properties: new[] { "specimen.age", "specimen.type" }),
        };

        var json = RuleSerializer.Serialize(original);

        // Serialized shape: a top-level rule "scope" object with "objects" and "properties" arrays.
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.TryGetProperty("scope", out var scope).Should().BeTrue();
        scope.ValueKind.Should().Be(JsonValueKind.Object);
        scope.GetProperty("objects").EnumerateArray().Select(e => e.GetString())
            .Should().Equal("specimen");
        scope.GetProperty("properties").EnumerateArray().Select(e => e.GetString())
            .Should().Equal("specimen.age", "specimen.type");

        var restored = RuleSerializer.Deserialize(json);

        restored.Scope.Should().NotBeNull();
        restored.Scope!.Objects.Should().Equal("specimen");
        restored.Scope.Properties.Should().Equal("specimen.age", "specimen.type");
    }

    [Fact]
    public void Rule_without_scope_round_trips_with_null_scope_and_omits_property()
    {
        var original = TestHelpers.Pm17();
        original.Scope.Should().BeNull();

        var json = RuleSerializer.Serialize(original);

        // Backward compatibility: a scopeless rule must not emit a top-level "scope" property.
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.TryGetProperty("scope", out _).Should().BeFalse();

        var restored = RuleSerializer.Deserialize(json);
        restored.Scope.Should().BeNull();
    }

    [Fact]
    public void Legacy_json_without_scope_deserializes_to_null_scope()
    {
        // A pre-existing rule JSON authored before scope existed must still load (Scope == null).
        const string legacyJson = """
        {
          "key": "LEGACY-1",
          "name": "Legacy rule",
          "phase": "Validate",
          "assert": { "type": "leaf", "subject": "specimen.age", "operator": "IsPresent" },
          "onFailure": { "type": "Warning", "scope": "order", "reason": "missing" }
        }
        """;

        var restored = RuleSerializer.Deserialize(legacyJson);

        restored.Key.Should().Be("LEGACY-1");
        restored.Scope.Should().BeNull();
    }
}
