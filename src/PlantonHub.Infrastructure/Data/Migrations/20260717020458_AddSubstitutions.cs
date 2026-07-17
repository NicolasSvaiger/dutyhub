using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSubstitutions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Substitutions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShiftDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    ShiftLabel = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ShiftStartTime = table.Column<TimeSpan>(type: "interval", nullable: false),
                    ShiftEndTime = table.Column<TimeSpan>(type: "interval", nullable: false),
                    ReasonType = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    AbsentUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubstituteUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ConfirmedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Substitutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Substitutions_Clinics_ClinicId",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Substitutions_Users_AbsentUserId",
                        column: x => x.AbsentUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Substitutions_Users_SubstituteUserId",
                        column: x => x.SubstituteUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Substitution_ClinicId",
                table: "Substitutions",
                column: "ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_Substitution_ShiftDate",
                table: "Substitutions",
                column: "ShiftDate");

            migrationBuilder.CreateIndex(
                name: "IX_Substitutions_AbsentUserId",
                table: "Substitutions",
                column: "AbsentUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Substitutions_SubstituteUserId",
                table: "Substitutions",
                column: "SubstituteUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Substitutions");
        }
    }
}
