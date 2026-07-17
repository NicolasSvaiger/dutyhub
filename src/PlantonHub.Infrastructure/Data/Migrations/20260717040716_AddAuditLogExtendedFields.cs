using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLogExtendedFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameIndex(
                name: "IX_AuditLogs_UserId",
                table: "AuditLogs",
                newName: "IX_AuditLog_UserId");

            migrationBuilder.AlterColumn<string>(
                name: "Operation",
                table: "AuditLogs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "EntityId",
                table: "AuditLogs",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Entity",
                table: "AuditLogs",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Details",
                table: "AuditLogs",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AfterValue",
                table: "AuditLogs",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BeforeValue",
                table: "AuditLogs",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IpAddress",
                table: "AuditLogs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Module",
                table: "AuditLogs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Alerts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: true),
                    RelatedUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrimaryActionLabel = table.Column<string>(type: "text", nullable: true),
                    SecondaryActionLabel = table.Column<string>(type: "text", nullable: true),
                    IsResolved = table.Column<bool>(type: "boolean", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    ResolvedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResolutionNotes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Alerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Alerts_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Alerts_Users_RelatedUserId",
                        column: x => x.RelatedUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Alerts_Users_ResolvedByUserId",
                        column: x => x.ResolvedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_Module",
                table: "AuditLogs",
                column: "Module");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_Timestamp",
                table: "AuditLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_ClinicId",
                table: "Alerts",
                column: "ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_RelatedUserId",
                table: "Alerts",
                column: "RelatedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_ResolvedByUserId",
                table: "Alerts",
                column: "ResolvedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Alerts");

            migrationBuilder.DropIndex(
                name: "IX_AuditLog_Module",
                table: "AuditLogs");

            migrationBuilder.DropIndex(
                name: "IX_AuditLog_Timestamp",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "AfterValue",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "BeforeValue",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "IpAddress",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "Module",
                table: "AuditLogs");

            migrationBuilder.RenameIndex(
                name: "IX_AuditLog_UserId",
                table: "AuditLogs",
                newName: "IX_AuditLogs_UserId");

            migrationBuilder.AlterColumn<string>(
                name: "Operation",
                table: "AuditLogs",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64);

            migrationBuilder.AlterColumn<string>(
                name: "EntityId",
                table: "AuditLogs",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Entity",
                table: "AuditLogs",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Details",
                table: "AuditLogs",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(4000)",
                oldMaxLength: 4000,
                oldNullable: true);
        }
    }
}
