using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlantonHub.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserPublicOrganRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserPublicOrganRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PublicOrganId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    AssignedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPublicOrganRoles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPublicOrganRoles_PublicOrgans_PublicOrganId",
                        column: x => x.PublicOrganId,
                        principalTable: "PublicOrgans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserPublicOrganRoles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserPublicOrganRole_PublicOrganId",
                table: "UserPublicOrganRoles",
                column: "PublicOrganId");

            migrationBuilder.CreateIndex(
                name: "IX_UserPublicOrganRole_UserId_PublicOrganId",
                table: "UserPublicOrganRoles",
                columns: new[] { "UserId", "PublicOrganId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserPublicOrganRoles");
        }
    }
}
