using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class UserClinicRoleConfiguration : IEntityTypeConfiguration<UserClinicRole>
{
    public void Configure(EntityTypeBuilder<UserClinicRole> builder)
    {
        builder.HasKey(ucr => ucr.Id);

        builder.HasIndex(ucr => new { ucr.UserId, ucr.ClinicId, ucr.Role })
            .IsUnique();

        builder.Property(ucr => ucr.Role)
            .HasConversion<int>();

        // Vínculo: status e origem. Defaults (Aprovado/Manual) cobrem as linhas
        // existentes na migração; o auto-cadastro por raio grava Pendente/Raio.
        builder.Property(ucr => ucr.Status)
            .HasDefaultValue(VinculoStatus.Aprovado);

        builder.Property(ucr => ucr.Source)
            .HasDefaultValue(VinculoSource.Manual);

        builder.HasOne(ucr => ucr.User)
            .WithMany(u => u.UserClinicRoles)
            .HasForeignKey(ucr => ucr.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(ucr => ucr.Clinic)
            .WithMany(c => c.UserClinicRoles)
            .HasForeignKey(ucr => ucr.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
