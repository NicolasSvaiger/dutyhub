using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAlerts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Clinics_ClinicId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Users_RelatedUserId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Users_ResolvedByUserId",
                table: "Alerts");

            migrationBuilder.RenameIndex(
                name: "IX_Alerts_ClinicId",
                table: "Alerts",
                newName: "IX_Alert_ClinicId");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Alerts",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "SecondaryActionLabel",
                table: "Alerts",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ResolutionNotes",
                table: "Alerts",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PrimaryActionLabel",
                table: "Alerts",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Alerts",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Code",
                table: "Alerts",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.CreateIndex(
                name: "IX_Alert_Code",
                table: "Alerts",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Alert_IsResolved_CreatedAt",
                table: "Alerts",
                columns: new[] { "IsResolved", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Clinics_ClinicId",
                table: "Alerts",
                column: "ClinicId",
                principalTable: "Clinics",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Users_RelatedUserId",
                table: "Alerts",
                column: "RelatedUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Users_ResolvedByUserId",
                table: "Alerts",
                column: "ResolvedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Clinics_ClinicId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Users_RelatedUserId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Users_ResolvedByUserId",
                table: "Alerts");

            migrationBuilder.DropIndex(
                name: "IX_Alert_Code",
                table: "Alerts");

            migrationBuilder.DropIndex(
                name: "IX_Alert_IsResolved_CreatedAt",
                table: "Alerts");

            migrationBuilder.RenameIndex(
                name: "IX_Alert_ClinicId",
                table: "Alerts",
                newName: "IX_Alerts_ClinicId");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Alerts",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300);

            migrationBuilder.AlterColumn<string>(
                name: "SecondaryActionLabel",
                table: "Alerts",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(120)",
                oldMaxLength: 120,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ResolutionNotes",
                table: "Alerts",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PrimaryActionLabel",
                table: "Alerts",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(120)",
                oldMaxLength: 120,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Alerts",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(4000)",
                oldMaxLength: 4000);

            migrationBuilder.AlterColumn<string>(
                name: "Code",
                table: "Alerts",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Clinics_ClinicId",
                table: "Alerts",
                column: "ClinicId",
                principalTable: "Clinics",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Users_RelatedUserId",
                table: "Alerts",
                column: "RelatedUserId",
                principalTable: "Users",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Users_ResolvedByUserId",
                table: "Alerts",
                column: "ResolvedByUserId",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}
