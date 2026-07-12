using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Clinic> Clinics => Set<Clinic>();
    public DbSet<UserClinicRole> UserClinicRoles => Set<UserClinicRole>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<ShiftAssignment> ShiftAssignments => Set<ShiftAssignment>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<OfflineAttendanceEvent> OfflineAttendanceEvents => Set<OfflineAttendanceEvent>();
    public DbSet<OfflineSyncAuditLog> OfflineSyncAuditLogs => Set<OfflineSyncAuditLog>();
    public DbSet<FaceEnrollment> FaceEnrollments => Set<FaceEnrollment>();
    public DbSet<DeviceRegistration> DeviceRegistrations => Set<DeviceRegistration>();
    public DbSet<DeviceUnlinkAudit> DeviceUnlinkAudits => Set<DeviceUnlinkAudit>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        modelBuilder.Entity<OfflineAttendanceEvent>(entity =>
        {
            entity.HasKey(e => e.OfflineAttendanceEventId);

            // Unique index for idempotency: (LocalEventId, UserId, DeviceId)
            entity.HasIndex(e => new { e.LocalEventId, e.UserId, e.DeviceId })
                .IsUnique()
                .HasDatabaseName("IX_OfflineAttendanceEvent_Idempotency");

            entity.Property(e => e.DeviceId).HasMaxLength(256);
            entity.Property(e => e.AppVersion).HasMaxLength(64);
            entity.Property(e => e.AttendanceType).HasMaxLength(16);
            entity.Property(e => e.ValidationMessages).HasColumnType("text");
        });

        modelBuilder.Entity<OfflineSyncAuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.UserId)
                .HasDatabaseName("IX_OfflineSyncAuditLog_UserId");

            entity.HasIndex(e => e.ClinicId)
                .HasDatabaseName("IX_OfflineSyncAuditLog_ClinicId");

            entity.HasIndex(e => e.LocalEventId)
                .HasDatabaseName("IX_OfflineSyncAuditLog_LocalEventId");

            entity.Property(e => e.DeviceId).HasMaxLength(256);
            entity.Property(e => e.IpAddress).HasMaxLength(64);
            entity.Property(e => e.UserAgent).HasMaxLength(512);
            entity.Property(e => e.RejectionOrReviewReason).HasMaxLength(2048);
        });

        modelBuilder.Entity<FaceEnrollment>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => new { e.UserId, e.IsActive })
                .HasDatabaseName("IX_FaceEnrollment_UserId_IsActive");

            entity.Property(e => e.Embedding)
                .HasColumnType("real[]")
                .IsRequired();

            entity.Property(e => e.PhotoUrl)
                .HasMaxLength(1024);

            entity.HasOne(e => e.User)
                .WithMany(u => u.FaceEnrollments)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DeviceRegistration>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => new { e.UserId, e.IsActive })
                .HasDatabaseName("IX_DeviceRegistration_UserId_IsActive");

            entity.Property(e => e.DeviceId).HasMaxLength(256).IsRequired();
            entity.Property(e => e.Platform).HasMaxLength(16).IsRequired();
            entity.Property(e => e.DeviceModel).HasMaxLength(128);

            entity.HasOne(e => e.User)
                .WithMany(u => u.DeviceRegistrations)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DeviceUnlinkAudit>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.UserId)
                .HasDatabaseName("IX_DeviceUnlinkAudit_UserId");

            entity.Property(e => e.OldDeviceId).HasMaxLength(256).IsRequired();
            entity.Property(e => e.Platform).HasMaxLength(16);
            entity.Property(e => e.DeviceModel).HasMaxLength(128);
            entity.Property(e => e.UnlinkedBy).HasMaxLength(128).IsRequired();
            entity.Property(e => e.Reason).HasMaxLength(512).IsRequired();

            entity.HasOne(e => e.User)
                .WithMany(u => u.DeviceUnlinkAudits)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
