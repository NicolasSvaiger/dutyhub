using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSettingsExtendedFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AzureEndpoint",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AzureRegion",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "BiometricAllowManualCheckin",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "BiometricConfidencePercent",
                table: "SystemSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "BiometricLogFailedAttempt",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "BiometricMaxAttempts",
                table: "SystemSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "DaylightSavingAuto",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "DetailedAuditLog",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "EmailCc",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "EmailSender",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "EmailSenderName",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "MfaRequired",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "NotificationChannelsJson",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OrgCnpj",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OrgEmail",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OrgName",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "PasswordRotationDays",
                table: "SystemSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SessionTimeoutMinutes",
                table: "SystemSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SystemTimezone",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AzureEndpoint",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "AzureRegion",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "BiometricAllowManualCheckin",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "BiometricConfidencePercent",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "BiometricLogFailedAttempt",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "BiometricMaxAttempts",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "DaylightSavingAuto",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "DetailedAuditLog",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "EmailCc",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "EmailSender",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "EmailSenderName",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "MfaRequired",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "NotificationChannelsJson",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "OrgCnpj",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "OrgEmail",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "OrgName",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "PasswordRotationDays",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "SessionTimeoutMinutes",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "SystemTimezone",
                table: "SystemSettings");
        }
    }
}
