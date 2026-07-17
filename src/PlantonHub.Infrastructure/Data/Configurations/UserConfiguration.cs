using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);

        builder.Property(u => u.Email)
            .IsRequired()
            .HasMaxLength(256);

        builder.HasIndex(u => u.Email)
            .IsUnique();

        builder.Property(u => u.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(u => u.PasswordHash)
            .IsRequired();

        builder.HasMany(u => u.UserClinicRoles)
            .WithOne(ucr => ucr.User)
            .HasForeignKey(ucr => ucr.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.ShiftAssignments)
            .WithOne(sa => sa.User)
            .HasForeignKey(sa => sa.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.Attendances)
            .WithOne(a => a.User)
            .HasForeignKey(a => a.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.AuditLogs)
            .WithOne(al => al.User)
            .HasForeignKey(al => al.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
