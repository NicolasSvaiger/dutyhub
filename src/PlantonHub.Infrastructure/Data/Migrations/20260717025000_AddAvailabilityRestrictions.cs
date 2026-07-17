using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAvailabilityRestrictions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AvailabilityRestrictions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    BlockedShiftsMask = table.Column<int>(type: "integer", nullable: true),
                    BlockedWeekdaysMask = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AvailabilityRestrictions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AvailabilityRestrictions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Justifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProtocolNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    AbsentUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShiftDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    ShiftTurn = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RequestType = table.Column<int>(type: "integer", nullable: false),
                    RequestText = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    DeadlineDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ResponseText = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    RespondedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    RespondedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Justifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Justifications_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Justifications_Users_AbsentUserId",
                        column: x => x.AbsentUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Justifications_Users_RespondedByUserId",
                        column: x => x.RespondedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityRestriction_DateRange",
                table: "AvailabilityRestrictions",
                columns: new[] { "StartDate", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityRestriction_UserId",
                table: "AvailabilityRestrictions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Justification_ClinicId",
                table: "Justifications",
                column: "ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_Justification_ProtocolNumber",
                table: "Justifications",
                column: "ProtocolNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Justification_ShiftDate",
                table: "Justifications",
                column: "ShiftDate");

            migrationBuilder.CreateIndex(
                name: "IX_Justifications_AbsentUserId",
                table: "Justifications",
                column: "AbsentUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Justifications_RespondedByUserId",
                table: "Justifications",
                column: "RespondedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AvailabilityRestrictions");

            migrationBuilder.DropTable(
                name: "Justifications");
        }
    }
}
