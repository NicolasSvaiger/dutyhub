using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class ShiftConfiguration : IEntityTypeConfiguration<Shift>
{
    public void Configure(EntityTypeBuilder<Shift> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.Title)
            .IsRequired()
            .HasMaxLength(200);

        builder.HasOne(s => s.Clinic)
            .WithMany(c => c.Shifts)
            .HasForeignKey(s => s.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.ShiftAssignments)
            .WithOne(sa => sa.Shift)
            .HasForeignKey(sa => sa.ShiftId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(s => s.Attendances)
            .WithOne(a => a.Shift)
            .HasForeignKey(a => a.ShiftId)
            .OnDelete(DeleteBehavior.Restrict);

        // Índice composto para queries de período por clínica (relatório gerencial,
        // billing, live-status). ShiftRepository.GetInPeriodWithDetailsAsync filtra
        // Where(s => s.Date >= from && s.Date < to) e frequentemente joga por
        // ClinicId nos includes; um índice composto cobre ambos.
        builder.HasIndex(s => new { s.ClinicId, s.Date })
            .HasDatabaseName("IX_Shift_ClinicId_Date");
    }
}
