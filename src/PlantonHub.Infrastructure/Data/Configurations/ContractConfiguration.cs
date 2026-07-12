using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class ContractConfiguration : IEntityTypeConfiguration<Contract>
{
    public void Configure(EntityTypeBuilder<Contract> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.ContractNumber)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(c => c.MonthlyValue)
            .HasColumnType("numeric(18,2)");

        builder.Property(c => c.Notes).HasMaxLength(2000);

        builder.Property(c => c.Status)
            .HasConversion<int>();

        // Contract → PublicOrgan
        builder.HasOne(c => c.PublicOrgan)
            .WithMany(p => p.Contracts)
            .HasForeignKey(c => c.PublicOrganId)
            .OnDelete(DeleteBehavior.Restrict);

        // Contract → Clinics (one-to-many)
        builder.HasMany(c => c.Clinics)
            .WithOne(cl => cl.Contract)
            .HasForeignKey(cl => cl.ContractId)
            .OnDelete(DeleteBehavior.SetNull)
            .IsRequired(false);
    }
}
