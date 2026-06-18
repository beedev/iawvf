using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IAW.Vdf.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class VocabularyInitial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "vocabulary_subjects",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    path = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    object_name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    label = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    data_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    effective_date = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    created_by = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    approved_by = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vocabulary_subjects", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_subjects_path",
                table: "vocabulary_subjects",
                column: "path",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_subjects_status",
                table: "vocabulary_subjects",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "vocabulary_subjects");
        }
    }
}
