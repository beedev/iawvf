using System.Text.Json.Nodes;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Triggers;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Core.Time;

namespace IAW.Vdf.Tests;

/// <summary>
/// Regression tests for the M1 rule corpus: verifies all 14 rules (10 reference + 4 extension)
/// round-trip through the serializer, that each "fires" fixture produces the expected outcome, and each
/// "clean" fixture produces no failure outcome. Also includes explicit tests for every rule not
/// already covered by EngineEndToEndTests.
/// </summary>
public sealed class CorpusRegressionTests
{
    private static readonly string RulesDir = FindDir("rules");
    private static readonly string FixturesDir = FindDir("fixtures");
    private static readonly string ReferenceDataPath = Path.Combine(RulesDir, "reference-data.json");

    private static readonly DateTimeOffset FixedNow = new(2026, 6, 17, 12, 0, 0, TimeSpan.Zero);

    // ─── reference data — DISK-LOADED via the real JSON provider ─────────────
    //
    // Correction #2: the corpus regression suite must exercise the same provider path as the
    // demo / integration host — JsonReferenceDataProvider reading rules/reference-data.json from
    // disk — with NO in-memory substitute. This proves the on-disk reference shape (arrays vs
    // objects) resolves correctly through the set-membership operators (InSet / IsCompatibleWith /
    // IsEligibleFor) for PM17, BL8, BL20, PM49, etc.

    private static JsonReferenceDataProvider DiskReferences()
        => JsonReferenceDataProvider.FromFile(ReferenceDataPath);

    // ─── helpers ────────────────────────────────────────────────────────────

    // Builds an engine over the supplied rules using the DISK-loaded JSON reference provider.
    private static VdfEngine BuildEngine(params RuleDefinition[] rules)
    {
        var refs = DiskReferences();
        var repo = new InMemoryRuleRepository(rules);
        return new VdfEngine(repo, refs, new RuleSelector(), new FixedClock(FixedNow));
    }

    private static async Task<EvaluationResult> Eval(VdfEngine engine, FactDocument facts)
        => await engine.EvaluateAsync(new EvaluationRequest
        {
            Trigger = Trigger.OrderEvent("Test"),
            Facts = facts,
            AsOf = FixedNow,
        });

    private static FactDocument LoadFixture(string name)
    {
        var path = Path.Combine(FixturesDir, name);
        return FactDocument.Parse(File.ReadAllText(path));
    }

    // Loads a single rule through the real JsonRuleRepository directory loader (disk path), mirroring
    // how a host wires JsonRuleRepository.FromDirectory(rules/). This exercises the same loader the
    // integration/demo path uses — including its handling of the co-located reference-data.json sidecar.
    private static RuleDefinition LoadRule(string key)
    {
        var repo = JsonRuleRepository.FromDirectory(RulesDir);
        return repo.GetByKeyAsync(key).GetAwaiter().GetResult()
               ?? throw new InvalidOperationException($"Rule '{key}' not found in {RulesDir}.");
    }

    // ─── CORPUS: round-trip all rule files ─────────────────────────────────

    [Theory]
    [InlineData("PM17")]
    [InlineData("PM48")]
    [InlineData("PM13")]
    [InlineData("BL8")]
    [InlineData("BL27")]
    [InlineData("BL20")]
    [InlineData("BL3")]
    [InlineData("BL36")]
    [InlineData("BL46")]
    [InlineData("PM49")]
    [InlineData("PM35_TIME")]
    [InlineData("PM49_DECISION")]
    [InlineData("BL33_CROSS")]
    [InlineData("BL38_MULTI")]
    public void Rule_file_round_trips_object_json_object(string key)
    {
        // Load from disk → deserialize → re-serialize → deserialize again → compare key.
        var path = Path.Combine(RulesDir, $"{key}.json");
        File.Exists(path).Should().BeTrue($"rule file {key}.json should exist in rules/");

        var json1 = File.ReadAllText(path);
        var rule1 = RuleSerializer.Deserialize(json1);
        rule1.Key.Should().Be(key);

        var json2 = RuleSerializer.Serialize(rule1);
        var rule2 = RuleSerializer.Deserialize(json2);
        rule2.Key.Should().Be(key);
        rule2.Phase.Should().Be(rule1.Phase);
        rule2.OnFailure.Type.Should().Be(rule1.OnFailure.Type);
    }

    // ─── CORPUS: fires / clean fixture coverage ──────────────────────────────

    [Theory]
    [InlineData("PM17",         OutcomeType.CompleteHold)]
    [InlineData("PM48",         OutcomeType.PartialHold)]
    [InlineData("PM13",         OutcomeType.CompleteHold)]
    [InlineData("BL8",          OutcomeType.ComplianceAlert)]
    [InlineData("BL27",         OutcomeType.Suppressed)]
    [InlineData("BL20",         OutcomeType.SetValue)]
    [InlineData("BL3",          OutcomeType.SetValue)]
    [InlineData("BL36",         OutcomeType.CreatePlaceholder)]
    [InlineData("BL46",         OutcomeType.PreventAction)]
    [InlineData("PM49",         OutcomeType.RouteToReview)]
    [InlineData("PM35_TIME",    OutcomeType.RouteToReview)]
    [InlineData("PM49_DECISION",OutcomeType.CompleteHold)]
    [InlineData("BL33_CROSS",   OutcomeType.CompleteHold)]
    [InlineData("BL38_MULTI",   OutcomeType.CreatePlaceholder)]
    public async Task Fires_fixture_produces_expected_outcome(string ruleKey, OutcomeType expectedType)
    {
        var rule = LoadRule(ruleKey);
        var engine = BuildEngine(rule);
        var facts = LoadFixture($"{ruleKey}_fires.json");

        var result = await Eval(engine, facts);

        var trace = result.Trace.Single(t => t.RuleKey == ruleKey);
        trace.Applied.Should().BeTrue($"rule {ruleKey} should apply to its _fires fixture");

        // For derivation rules (BL3, BL20) there is no assertion — they produce OnFailure as the derivation.
        // For all others the assert fails.
        result.Outcomes.Should().Contain(o => o.Type == expectedType,
            $"rule {ruleKey} _fires fixture should produce {expectedType}");

        // Decision trace must always be populated when the rule applied.
        trace.Conditions.Should().NotBeNull();
    }

    [Theory]
    [InlineData("PM17")]
    [InlineData("PM48")]
    [InlineData("PM13")]
    [InlineData("BL8")]
    [InlineData("BL27")]
    [InlineData("BL36")]
    [InlineData("BL46")]
    [InlineData("PM49")]
    [InlineData("PM35_TIME")]
    [InlineData("PM49_DECISION")]
    [InlineData("BL33_CROSS")]
    [InlineData("BL38_MULTI")]
    public async Task Clean_fixture_produces_no_failure_outcome(string ruleKey)
    {
        var rule = LoadRule(ruleKey);
        var engine = BuildEngine(rule);
        var facts = LoadFixture($"{ruleKey}_clean.json");

        var result = await Eval(engine, facts);

        var failureTypes = new[]
        {
            OutcomeType.CompleteHold, OutcomeType.PartialHold, OutcomeType.Warning,
            OutcomeType.ComplianceAlert, OutcomeType.RouteToReview, OutcomeType.PreventAction,
            OutcomeType.CreatePlaceholder
        };

        result.Outcomes.Should().NotContain(
            o => failureTypes.Contains(o.Type),
            $"rule {ruleKey} _clean fixture should produce no failure outcome");
    }

    // ─── EXPLICIT: PM13 — specimen-type compatibility (+ recovery → CompleteHold) ────

    [Fact]
    public async Task Pm13_incompatible_specimen_produces_CompleteHold()
    {
        var rule = LoadRule("PM13");
        var engine = BuildEngine(rule);
        // Ordered test present, but the only specimen type is not compatible per TestCompendium.
        var facts = FactDocument.Parse("""
            { "test": { "orderedTest": "FISH-T-001" }, "order": { "specimens": [ { "type": "Saliva" } ] } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.CompleteHold);
        result.Outcomes[0].Scope.Should().Be("order");

        var trace = result.Trace.Single(t => t.RuleKey == "PM13");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
    }

    [Fact]
    public async Task Pm13_compatible_specimen_continues()
    {
        var rule = LoadRule("PM13");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "test": { "orderedTest": "FISH-T-001" }, "order": { "specimens": [ { "type": "FFPE" } ] } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
        result.Trace.Single(t => t.RuleKey == "PM13").AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Pm13_does_not_apply_without_ordered_test()
    {
        var rule = LoadRule("PM13");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "specimens": [ { "type": "Saliva" } ] } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM13").Applied.Should().BeFalse();
    }

    // ─── EXPLICIT: BL8 — NY-regulated compliance alert ──────────────────────

    [Fact]
    public async Task Bl8_ny_regulated_non_validated_lab_produces_ComplianceAlert()
    {
        var rule = LoadRule("BL8");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "client": { "nyStatus": "NYRegulated" }, "performingLab": "Lab-CA-1" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.ComplianceAlert);
        result.Outcomes[0].Severity.Should().Be("informational");
        result.Outcomes[0].Scope.Should().Be("order");

        var trace = result.Trace.Single(t => t.RuleKey == "BL8");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
        trace.Conditions.Should().Contain(c => c.Subject == "order.performingLab" && !c.Result);
    }

    [Fact]
    public async Task Bl8_ny_regulated_validated_lab_continues()
    {
        var rule = LoadRule("BL8");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "client": { "nyStatus": "NYRegulated" }, "performingLab": "Lab-NY-1" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
    }

    [Fact]
    public async Task Bl8_does_not_apply_when_not_NY_regulated()
    {
        var rule = LoadRule("BL8");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "client": { "nyStatus": "Standard" }, "performingLab": "Lab-CA-1" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "BL8").Applied.Should().BeFalse();
    }

    // ─── EXPLICIT: BL20 — derive body site for Bone Marrow specimens ──────────

    [Fact]
    public async Task Bl20_bone_marrow_without_body_site_stamps_bodySite()
    {
        var rule = LoadRule("BL20");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""{ "specimen": { "type": "BoneMarrow" } }""");

        var result = await Eval(engine, facts);

        var trace = result.Trace.Single(t => t.RuleKey == "BL20");
        trace.Applied.Should().BeTrue();
        trace.Produced!.Type.Should().Be(OutcomeType.SetValue);
        result.FactsAfter.GetString("specimen.bodySite").Should().Be("BoneMarrow");
    }

    [Fact]
    public async Task Bl20_bone_marrow_with_body_site_does_not_apply()
    {
        var rule = LoadRule("BL20");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""{ "specimen": { "type": "BoneMarrow", "bodySite": "Iliac Crest" } }""");

        var result = await Eval(engine, facts);

        result.Trace.Single(t => t.RuleKey == "BL20").Applied.Should().BeFalse();
        result.FactsAfter.GetString("specimen.bodySite").Should().Be("Iliac Crest");
    }

    [Fact]
    public async Task Bl20_non_bone_marrow_does_not_apply()
    {
        var rule = LoadRule("BL20");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""{ "specimen": { "type": "FFPE" } }""");

        var result = await Eval(engine, facts);

        result.Trace.Single(t => t.RuleKey == "BL20").Applied.Should().BeFalse();
    }

    // ─── EXPLICIT: BL46 — Prevent Action when follow-up lacks qualifying initial order ────────

    [Fact]
    public async Task Bl46_followup_without_qualifying_initial_order_produces_PreventAction()
    {
        var rule = LoadRule("BL46");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""{ "order": { "id": "ORD-001", "type": "FollowUp" } }""");

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.PreventAction);
        var outcome = result.Outcomes[0];
        outcome.Group.Should().Be(OutcomeGroup.Control);
        outcome.Scope.Should().Be("order");
        outcome.Parameters["Action"].Should().Be("submit-order");

        var trace = result.Trace.Single(t => t.RuleKey == "BL46");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
        trace.Conditions.Should().Contain(c => c.Subject == "order.qualifyingInitialOrder" && !c.Result);
    }

    [Fact]
    public async Task Bl46_followup_with_qualifying_initial_order_continues()
    {
        var rule = LoadRule("BL46");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "id": "ORD-001", "type": "FollowUp", "qualifyingInitialOrder": "ORD-12345" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
        result.Trace.Single(t => t.RuleKey == "BL46").AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Bl46_initial_order_does_not_apply()
    {
        var rule = LoadRule("BL46");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "id": "ORD-001", "type": "Initial" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "BL46").Applied.Should().BeFalse();
    }

    // ─── EXPLICIT: PM49 — fixation-time review for CAP-governed testing ───────

    [Fact]
    public async Task Pm49_fixation_out_of_window_routes_to_medical_review()
    {
        var rule = LoadRule("PM49");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "test": { "capGoverned": true }, "specimen": { "fixationTime": 100 } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.RouteToReview);
        result.Outcomes[0].Scope.Should().Be("test");
        result.Outcomes[0].Parameters["Destination"].Should().Be("MedicalReview");

        var trace = result.Trace.Single(t => t.RuleKey == "PM49");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
        trace.Conditions.Should().Contain(c => c.Subject == "specimen.fixationTime" && !c.Result);
    }

    [Fact]
    public async Task Pm49_fixation_within_window_continues()
    {
        var rule = LoadRule("PM49");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "test": { "capGoverned": true }, "specimen": { "fixationTime": 24 } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
        result.Trace.Single(t => t.RuleKey == "PM49").AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Pm49_non_cap_governed_does_not_apply()
    {
        var rule = LoadRule("PM49");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "test": { "capGoverned": false }, "specimen": { "fixationTime": 100 } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM49").Applied.Should().BeFalse();
    }

    // ─── EXPLICIT: BL36 — placeholder PB specimen for RaDaR first timepoint ───

    [Fact]
    public async Task Bl36_radar_first_missing_peripheral_blood_creates_placeholder()
    {
        var rule = LoadRule("BL36");
        var engine = BuildEngine(rule);
        // RaDaR first-timepoint with paraffin tissue but no peripheral blood.
        var facts = FactDocument.Parse("""
            { "order": { "product": "RaDaR", "timepoint": "First", "specimens": [ { "type": "ParaffinTissue" } ] } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.CreatePlaceholder);
        result.Outcomes[0].Scope.Should().Be("specimen");
        result.Outcomes[0].Parameters["SpecimenType"].Should().Be("PeripheralBlood");

        var trace = result.Trace.Single(t => t.RuleKey == "BL36");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
    }

    [Fact]
    public async Task Bl36_radar_first_with_peripheral_blood_continues()
    {
        var rule = LoadRule("BL36");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "product": "RaDaR", "timepoint": "First", "specimens": [ { "type": "ParaffinTissue" }, { "type": "PeripheralBlood" } ] } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
        result.Trace.Single(t => t.RuleKey == "BL36").AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Bl36_non_radar_does_not_apply()
    {
        var rule = LoadRule("BL36");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "product": "Standard", "timepoint": "First", "specimens": [ { "type": "ParaffinTissue" } ] } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "BL36").Applied.Should().BeFalse();
    }

    // ─── EXTENSION: PM35_TIME — time-trigger escalation ──────────────────────

    [Fact]
    public async Task Pm35_time_incident_over_threshold_routes_to_escalation()
    {
        var rule = LoadRule("PM35_TIME");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "incident": { "id": "INC-001", "ageHours": 30 } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.RouteToReview);
        result.Outcomes[0].Parameters["Destination"].Should().Be("EscalationQueue");

        var trace = result.Trace.Single(t => t.RuleKey == "PM35_TIME");
        trace.Applied.Should().BeTrue();
        trace.Conditions.Should().NotBeEmpty();
        trace.Conditions.Should().Contain(c => c.Subject == "incident.ageHours");
    }

    [Fact]
    public async Task Pm35_time_incident_under_threshold_does_not_apply()
    {
        var rule = LoadRule("PM35_TIME");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "incident": { "id": "INC-001", "ageHours": 12 } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM35_TIME").Applied.Should().BeFalse();
    }

    // ─── EXTENSION: PM49_DECISION — human decision downstream ─────────────────

    [Fact]
    public async Task Pm49_decision_reject_produces_CompleteHold_on_test()
    {
        var rule = LoadRule("PM49_DECISION");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "medicalReview": { "decision": "Reject" }, "test": { "code": "FISH-T-001" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.CompleteHold);
        result.Outcomes[0].Scope.Should().Be("test");

        var trace = result.Trace.Single(t => t.RuleKey == "PM49_DECISION");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
        trace.Conditions.Should().Contain(c => c.Subject == "medicalReview.decision");
    }

    [Fact]
    public async Task Pm49_decision_approve_does_not_apply()
    {
        var rule = LoadRule("PM49_DECISION");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "medicalReview": { "decision": "Approve" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM49_DECISION").Applied.Should().BeFalse();
    }

    [Fact]
    public async Task Pm49_decision_no_review_does_not_apply()
    {
        var rule = LoadRule("PM49_DECISION");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "test": { "code": "FISH-T-001" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "PM49_DECISION").Applied.Should().BeFalse();
    }

    // ─── EXTENSION: BL33_CROSS — cross-entity sequencing ─────────────────────

    [Fact]
    public async Task Bl33_cross_followup_with_incomplete_prior_produces_CompleteHold()
    {
        var rule = LoadRule("BL33_CROSS");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "type": "FollowUp" }, "priorTimepoint": { "status": "InProgress" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.CompleteHold);
        result.Outcomes[0].Scope.Should().Be("order");

        var trace = result.Trace.Single(t => t.RuleKey == "BL33_CROSS");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
        trace.Conditions.Should().Contain(c => c.Subject == "priorTimepoint.status");
    }

    [Fact]
    public async Task Bl33_cross_followup_with_complete_prior_continues()
    {
        var rule = LoadRule("BL33_CROSS");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "type": "FollowUp" }, "priorTimepoint": { "status": "Complete" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
        result.Trace.Single(t => t.RuleKey == "BL33_CROSS").AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Bl33_cross_initial_order_does_not_apply()
    {
        var rule = LoadRule("BL33_CROSS");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            { "order": { "type": "Initial" }, "priorTimepoint": { "status": "InProgress" } }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "BL33_CROSS").Applied.Should().BeFalse();
    }

    // ─── EXTENSION: BL38_MULTI — multi-record placeholder ────────────────────

    [Fact]
    public async Task Bl38_multi_radar_first_missing_peripheral_blood_produces_CreatePlaceholder()
    {
        var rule = LoadRule("BL38_MULTI");
        var engine = BuildEngine(rule);
        // Has ParaffinTissue but not PeripheralBlood.
        var facts = FactDocument.Parse("""
            {
              "order": {
                "product": "RaDaR",
                "timepoint": "First",
                "specimens": [ { "type": "ParaffinTissue" } ]
              }
            }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().ContainSingle(o => o.Type == OutcomeType.CreatePlaceholder);
        result.Outcomes[0].Parameters["SpecimenType"].Should().Be("PeripheralBlood");

        var trace = result.Trace.Single(t => t.RuleKey == "BL38_MULTI");
        trace.Applied.Should().BeTrue();
        trace.AssertResult.Should().BeFalse();
    }

    [Fact]
    public async Task Bl38_multi_radar_first_with_both_specimens_continues()
    {
        var rule = LoadRule("BL38_MULTI");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            {
              "order": {
                "product": "RaDaR",
                "timepoint": "First",
                "specimens": [
                  { "type": "ParaffinTissue" },
                  { "type": "PeripheralBlood" }
                ]
              }
            }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Single().Type.Should().Be(OutcomeType.Continue);
        result.Trace.Single(t => t.RuleKey == "BL38_MULTI").AssertResult.Should().BeTrue();
    }

    [Fact]
    public async Task Bl38_multi_non_radar_order_does_not_apply()
    {
        var rule = LoadRule("BL38_MULTI");
        var engine = BuildEngine(rule);
        var facts = FactDocument.Parse("""
            {
              "order": {
                "product": "Standard",
                "timepoint": "First",
                "specimens": []
              }
            }
            """);

        var result = await Eval(engine, facts);

        result.Outcomes.Should().BeEmpty();
        result.Trace.Single(t => t.RuleKey == "BL38_MULTI").Applied.Should().BeFalse();
    }

    // ─── TRACE: decision traces populated on all evaluated rules ─────────────

    [Fact]
    public async Task Decision_traces_populated_for_all_evaluated_rules()
    {
        var rules = new[]
        {
            LoadRule("PM17"), LoadRule("PM48"), LoadRule("PM13"),
            LoadRule("BL8"),  LoadRule("BL27"), LoadRule("BL20"),
            LoadRule("BL3"),  LoadRule("BL46"), LoadRule("PM49"),
        };
        var engine = BuildEngine(rules);

        // All-clear well-formed order — all rules run but none hold.
        var facts = FactDocument.Parse("""
            {
              "test": { "code": "FISH-T-001", "specimen": { "type": "FFPE" }, "orderedTest": "FISH-T-001" },
              "document": { "circledHE": "slide-HE-001" },
              "specimen": { "type": "FFPE", "age": 5, "fixationTime": 24 },
              "patient": { "age": 45, "gender": "Male" },
              "order": {
                "client": { "nyStatus": "Standard" },
                "performingLab": "Lab-NY-1",
                "product": null,
                "specimens": [ { "type": "FFPE" } ]
              }
            }
            """);

        var result = await Eval(engine, facts);

        result.Trace.Should().NotBeEmpty();
        result.Trace.Should().HaveCountGreaterOrEqualTo(rules.Length);

        // Every trace record must carry the rule key, version, and phase.
        foreach (var trace in result.Trace)
        {
            trace.RuleKey.Should().NotBeNullOrEmpty();
            trace.Version.Should().BeGreaterThan(0);
            trace.EvaluatedAt.Should().Be(FixedNow);
        }
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────

    private static string FindDir(string name)
    {
        // Walk from the test assembly location upward until we find the repo root.
        var dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            var candidate = Path.Combine(dir, name);
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = Directory.GetParent(dir)?.FullName;
        }

        // Absolute fallback (for running from repo root via `dotnet test`).
        var abs = $"/Users/bharath/Desktop/NeoGenomics/IAW/{name}";
        if (Directory.Exists(abs))
        {
            return abs;
        }

        throw new DirectoryNotFoundException(
            $"Could not locate '{name}' directory — run from the repo root or ensure the build output path is correct.");
    }
}
