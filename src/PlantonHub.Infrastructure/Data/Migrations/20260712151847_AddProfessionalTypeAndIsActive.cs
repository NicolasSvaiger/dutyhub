using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProfessionalTypeAndIsActive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ProfessionalType",
                table: "Users",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ProfessionalType",
                table: "Users");
        }
    }
}
