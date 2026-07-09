using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOfflineSyncAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "AllowedRadiusMeters",
                table: "Clinics",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "Clinics",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "Clinics",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LocalEventId",
                table: "Attendances",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OfflineAttendanceEvents",
                columns: table => new
                {
                    OfflineAttendanceEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttendanceType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LocalDateTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReceivedAtServer = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Latitude = table.Column<double>(type: "double precision", nullable: false),
                    Longitude = table.Column<double>(type: "double precision", nullable: false),
                    DeviceId = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    AppVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BiometricValidated = table.Column<bool>(type: "boolean", nullable: false),
                    SyncStatus = table.Column<int>(type: "integer", nullable: false),
                    IsDuplicate = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresReview = table.Column<bool>(type: "boolean", nullable: false),
                    AntiFraudFlags = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OfflineAttendanceEvents", x => x.OfflineAttendanceEventId);
                    table.ForeignKey(
                        name: "FK_OfflineAttendanceEvents_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OfflineAttendanceEvents_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OfflineAttendanceEvents_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OfflineSyncAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDateTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReceivedAtServer = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeviceId = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    Latitude = table.Column<double>(type: "double precision", nullable: false),
                    Longitude = table.Column<double>(type: "double precision", nullable: false),
                    ValidationResult = table.Column<int>(type: "integer", nullable: false),
                    RejectionOrReviewReason = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OfflineSyncAuditLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OfflineSyncAuditLogs_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OfflineSyncAuditLogs_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OfflineSyncAuditLogs_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OfflineAttendanceEvent_Idempotency",
                table: "OfflineAttendanceEvents",
                columns: new[] { "LocalEventId", "UserId", "DeviceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OfflineAttendanceEvents_ClinicId",
                table: "OfflineAttendanceEvents",
                column: "ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_OfflineAttendanceEvents_ShiftId",
                table: "OfflineAttendanceEvents",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_OfflineAttendanceEvents_UserId",
                table: "OfflineAttendanceEvents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_OfflineSyncAuditLog_ClinicId",
                table: "OfflineSyncAuditLogs",
                column: "ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_OfflineSyncAuditLog_LocalEventId",
                table: "OfflineSyncAuditLogs",
                column: "LocalEventId");

            migrationBuilder.CreateIndex(
                name: "IX_OfflineSyncAuditLog_UserId",
                table: "OfflineSyncAuditLogs",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_OfflineSyncAuditLogs_ShiftId",
                table: "OfflineSyncAuditLogs",
                column: "ShiftId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OfflineAttendanceEvents");

            migrationBuilder.DropTable(
                name: "OfflineSyncAuditLogs");

            migrationBuilder.DropColumn(
                name: "AllowedRadiusMeters",
                table: "Clinics");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "Clinics");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "Clinics");

            migrationBuilder.DropColumn(
                name: "LocalEventId",
                table: "Attendances");
        }
    }
}
