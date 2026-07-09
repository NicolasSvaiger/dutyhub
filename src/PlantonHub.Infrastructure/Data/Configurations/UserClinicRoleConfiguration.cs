using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

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
