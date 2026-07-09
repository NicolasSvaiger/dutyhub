using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOfflineSyncFieldsToAttendance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CheckInLocalDateTime",
                table: "Attendances",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CheckInServerDateTime",
                table: "Attendances",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CheckOutLocalDateTime",
                table: "Attendances",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CheckOutServerDateTime",
                table: "Attendances",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresReview",
                table: "Attendances",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ReviewReason",
                table: "Attendances",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SyncSource",
                table: "Attendances",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "SyncStatus",
                table: "Attendances",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CheckInLocalDateTime",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "CheckInServerDateTime",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "CheckOutLocalDateTime",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "CheckOutServerDateTime",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "RequiresReview",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "ReviewReason",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "SyncSource",
                table: "Attendances");

            migrationBuilder.DropColumn(
                name: "SyncStatus",
                table: "Attendances");
        }
    }
}
