using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class PublicOrganConfiguration : IEntityTypeConfiguration<PublicOrgan>
{
    public void Configure(EntityTypeBuilder<PublicOrgan> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Name)
            .IsRequired()
            .HasMaxLength(300);

        builder.Property(p => p.Acronym).HasMaxLength(20);
        builder.Property(p => p.Cnpj).HasMaxLength(14);
        builder.Property(p => p.Department).HasMaxLength(200);
        builder.Property(p => p.City).HasMaxLength(100);
        builder.Property(p => p.State).HasMaxLength(2);
        builder.Property(p => p.ContactName).HasMaxLength(200);
        builder.Property(p => p.ContactEmail).HasMaxLength(256);
        builder.Property(p => p.ContactPhone).HasMaxLength(20);

        builder.Property(p => p.IsActive).HasDefaultValue(true);

        // Self-referencing hierarchy: subprefeitura → prefeitura
        builder.HasOne(p => p.Parent)
            .WithMany(p => p.Children)
            .HasForeignKey(p => p.ParentId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);
    }
}
