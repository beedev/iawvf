using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IAW.Vdf.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class VdfInitial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "decision_traces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    correlation_id = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    rule_key = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    phase = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    applied = table.Column<bool>(type: "boolean", nullable: false),
                    assert_result = table.Column<bool>(type: "boolean", nullable: true),
                    produced_outcome_json = table.Column<string>(type: "jsonb", nullable: true),
                    conditions_json = table.Column<string>(type: "jsonb", nullable: false),
                    facts_read_json = table.Column<string>(type: "jsonb", nullable: false),
                    evaluated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_decision_traces", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "reference_data",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    source = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    key = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    value_json = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reference_data", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "rules",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    rule_key = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    rule_set = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    priority = table.Column<int>(type: "integer", nullable: false),
                    phase = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rules", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "rule_versions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    rule_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    effective_date = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    expiry_date = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    definition_json = table.Column<string>(type: "jsonb", nullable: false),
                    author_nl = table.Column<string>(type: "text", nullable: true),
                    interpreter_version = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    authored_by = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false, defaultValue: "system"),
                    approved_by = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rule_versions", x => x.id);
                    table.ForeignKey(
                        name: "FK_rule_versions_rules_rule_id",
                        column: x => x.rule_id,
                        principalTable: "rules",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_decision_traces_correlation_id",
                table: "decision_traces",
                column: "correlation_id");

            migrationBuilder.CreateIndex(
                name: "ix_decision_traces_rule_key",
                table: "decision_traces",
                column: "rule_key");

            migrationBuilder.CreateIndex(
                name: "ix_reference_data_source_key",
                table: "reference_data",
                columns: new[] { "source", "key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_rule_versions_is_active_effective_date",
                table: "rule_versions",
                columns: new[] { "is_active", "effective_date" });

            migrationBuilder.CreateIndex(
                name: "ix_rule_versions_rule_id_version",
                table: "rule_versions",
                columns: new[] { "rule_id", "version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_rules_rule_key",
                table: "rules",
                column: "rule_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "decision_traces");

            migrationBuilder.DropTable(
                name: "reference_data");

            migrationBuilder.DropTable(
                name: "rule_versions");

            migrationBuilder.DropTable(
                name: "rules");
        }
    }
}
