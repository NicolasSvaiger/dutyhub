using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Infrastructure.Data.Configurations;

public class AttendanceConfiguration : IEntityTypeConfiguration<Attendance>
{
    public void Configure(EntityTypeBuilder<Attendance> builder)
    {
        builder.HasKey(a => a.Id);

        builder.Property(a => a.CheckInDeviceId)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(a => a.CheckOutDeviceId)
            .HasMaxLength(100);

        // Offline sync fields
        builder.Property(a => a.LocalEventId)
            .IsRequired(false);

        builder.Property(a => a.CheckInLocalDateTime)
            .IsRequired(false);

        builder.Property(a => a.CheckInServerDateTime)
            .IsRequired(false);

        builder.Property(a => a.CheckOutLocalDateTime)
            .IsRequired(false);

        builder.Property(a => a.CheckOutServerDateTime)
            .IsRequired(false);

        builder.Property(a => a.SyncSource)
            .HasDefaultValue(SyncSource.Online)
            .HasSentinel((SyncSource)0)
            .HasConversion<int>();

        builder.Property(a => a.SyncStatus)
            .HasDefaultValue(SyncStatus.OnlineSynced)
            .HasSentinel((SyncStatus)0)
            .HasConversion<int>();

        builder.Property(a => a.RequiresReview)
            .HasDefaultValue(false);

        builder.Property(a => a.ReviewReason)
            .IsRequired(false)
            .HasMaxLength(500);

        // Relationships
        builder.HasOne(a => a.User)
            .WithMany(u => u.Attendances)
            .HasForeignKey(a => a.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(a => a.Shift)
            .WithMany(s => s.Attendances)
            .HasForeignKey(a => a.ShiftId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(a => a.Clinic)
            .WithMany(c => c.Attendances)
            .HasForeignKey(a => a.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
