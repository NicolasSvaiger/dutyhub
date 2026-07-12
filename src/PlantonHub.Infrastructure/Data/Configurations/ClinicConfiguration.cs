using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class ClinicConfiguration : IEntityTypeConfiguration<Clinic>
{
    public void Configure(EntityTypeBuilder<Clinic> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(c => c.Address)
            .HasMaxLength(500);

        builder.Property(c => c.Phone)
            .HasMaxLength(20);

        builder.Property(c => c.IsActive)
            .HasDefaultValue(true);

        builder.Property(c => c.City)
            .HasMaxLength(100);

        builder.Property(c => c.Neighborhood)
            .HasMaxLength(100);

        builder.Property(c => c.ZipCode)
            .HasMaxLength(10);

        // ContractId is configured via ContractConfiguration (SetNull on contract delete)

        builder.HasMany(c => c.UserClinicRoles)
            .WithOne(ucr => ucr.Clinic)
            .HasForeignKey(ucr => ucr.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Shifts)
            .WithOne(s => s.Clinic)
            .HasForeignKey(s => s.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Attendances)
            .WithOne(a => a.Clinic)
            .HasForeignKey(a => a.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
