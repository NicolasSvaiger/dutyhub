using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSelfRegistrationStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.AddColumn<int>(
                name: "Source",
                table: "UserClinicRoles",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "UserClinicRoles",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            // Backfill: usuários já inativos passam a Inativo (3); os demais
            // ficam com o default Ativo (2). Vínculos existentes ficam
            // Aprovado (2) / Manual (1) pelos defaults acima.
            migrationBuilder.Sql("UPDATE \"Users\" SET \"Status\" = 3 WHERE \"IsActive\" = false;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "UserClinicRoles");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "UserClinicRoles");
        }
    }
}
