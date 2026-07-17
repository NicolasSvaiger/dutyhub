using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Shifts_ClinicId",
                table: "Shifts");

            migrationBuilder.RenameIndex(
                name: "IX_Attendances_UserId",
                table: "Attendances",
                newName: "IX_Attendance_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_Attendances_ShiftId",
                table: "Attendances",
                newName: "IX_Attendance_ShiftId");

            migrationBuilder.RenameIndex(
                name: "IX_Attendances_ClinicId",
                table: "Attendances",
                newName: "IX_Attendance_ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_User_Cpf_Unique",
                table: "Users",
                column: "Cpf",
                unique: true,
                filter: "\"Cpf\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Shift_ClinicId_Date",
                table: "Shifts",
                columns: new[] { "ClinicId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_Attendance_CheckInTime",
                table: "Attendances",
                column: "CheckInTime");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_User_Cpf_Unique",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Shift_ClinicId_Date",
                table: "Shifts");

            migrationBuilder.DropIndex(
                name: "IX_Attendance_CheckInTime",
                table: "Attendances");

            migrationBuilder.RenameIndex(
                name: "IX_Attendance_UserId",
                table: "Attendances",
                newName: "IX_Attendances_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_Attendance_ShiftId",
                table: "Attendances",
                newName: "IX_Attendances_ShiftId");

            migrationBuilder.RenameIndex(
                name: "IX_Attendance_ClinicId",
                table: "Attendances",
                newName: "IX_Attendances_ClinicId");

            migrationBuilder.CreateIndex(
                name: "IX_Shifts_ClinicId",
                table: "Shifts",
                column: "ClinicId");
        }
    }
}
