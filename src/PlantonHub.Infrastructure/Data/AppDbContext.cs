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
    public DbSet<PublicOrgan> PublicOrgans => Set<PublicOrgan>();
    public DbSet<Contract> Contracts => Set<Contract>();
    public DbSet<SystemSettings> SystemSettings => Set<SystemSettings>();
    public DbSet<UserClinicRole> UserClinicRoles => Set<UserClinicRole>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<ShiftAssignment> ShiftAssignments => Set<ShiftAssignment>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<OfflineAttendanceEvent> OfflineAttendanceEvents => Set<OfflineAttendanceEvent>();
    public DbSet<OfflineSyncAuditLog> OfflineSyncAuditLogs => Set<OfflineSyncAuditLog>();
    public DbSet<FaceEnrollment> FaceEnrollments => Set<FaceEnrollment>();
    public DbSet<DeviceRegistration> DeviceRegistrations => Set<DeviceRegistration>();
    public DbSet<DeviceUnlinkAudit> DeviceUnlinkAudits => Set<DeviceUnlinkAudit>();
    public DbSet<ClinicShiftTemplate> ClinicShiftTemplates => Set<ClinicShiftTemplate>();
    public DbSet<Substitution> Substitutions => Set<Substitution>();
    public DbSet<AvailabilityRestriction> AvailabilityRestrictions => Set<AvailabilityRestriction>();
    public DbSet<Justification> Justifications => Set<Justification>();
    public DbSet<Alert> Alerts => Set<Alert>();

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

        modelBuilder.Entity<Substitution>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.ClinicId)
                .HasDatabaseName("IX_Substitution_ClinicId");

            entity.HasIndex(e => e.ShiftDate)
                .HasDatabaseName("IX_Substitution_ShiftDate");

            entity.Property(e => e.ShiftLabel).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(e => e.Clinic)
                .WithMany()
                .HasForeignKey(e => e.ClinicId)
                .OnDelete(DeleteBehavior.Restrict);

            // Two distinct FKs to User — must both use Restrict to avoid
            // multiple cascade paths to the same table (SQL Server/Postgres would reject it).
            entity.HasOne(e => e.AbsentUser)
                .WithMany()
                .HasForeignKey(e => e.AbsentUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.SubstituteUser)
                .WithMany()
                .HasForeignKey(e => e.SubstituteUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Justification>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.ProtocolNumber)
                .IsUnique()
                .HasDatabaseName("IX_Justification_ProtocolNumber");

            entity.HasIndex(e => e.ClinicId)
                .HasDatabaseName("IX_Justification_ClinicId");

            entity.HasIndex(e => e.ShiftDate)
                .HasDatabaseName("IX_Justification_ShiftDate");

            entity.Property(e => e.ProtocolNumber).HasMaxLength(64).IsRequired();
            entity.Property(e => e.ShiftTurn).HasMaxLength(64).IsRequired();
            entity.Property(e => e.RequestText).HasMaxLength(4000).IsRequired();
            entity.Property(e => e.ResponseText).HasMaxLength(4000);

            entity.HasOne(e => e.Clinic)
                .WithMany()
                .HasForeignKey(e => e.ClinicId)
                .OnDelete(DeleteBehavior.Restrict);

            // Same reasoning as Substitution: two FKs to User require Restrict
            // to avoid multiple cascade paths.
            entity.HasOne(e => e.AbsentUser)
                .WithMany()
                .HasForeignKey(e => e.AbsentUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.RespondedByUser)
                .WithMany()
                .HasForeignKey(e => e.RespondedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);

            // Filtros comuns: por período (Timestamp), por usuário, por módulo.
            entity.HasIndex(e => e.Timestamp).HasDatabaseName("IX_AuditLog_Timestamp");
            entity.HasIndex(e => e.UserId).HasDatabaseName("IX_AuditLog_UserId");
            entity.HasIndex(e => e.Module).HasDatabaseName("IX_AuditLog_Module");

            entity.Property(e => e.Operation).HasMaxLength(64).IsRequired();
            entity.Property(e => e.Entity).HasMaxLength(128).IsRequired();
            entity.Property(e => e.EntityId).HasMaxLength(128).IsRequired();
            entity.Property(e => e.Details).HasMaxLength(4000);
            entity.Property(e => e.Module).HasMaxLength(64);
            entity.Property(e => e.IpAddress).HasMaxLength(64);
            entity.Property(e => e.BeforeValue).HasMaxLength(1000);
            entity.Property(e => e.AfterValue).HasMaxLength(1000);
        });

        modelBuilder.Entity<AvailabilityRestriction>(entity =>
        {
            entity.HasKey(e => e.Id);

            // Queries mais comuns: buscar restrições de um usuário e/ou por período.
            entity.HasIndex(e => e.UserId)
                .HasDatabaseName("IX_AvailabilityRestriction_UserId");

            entity.HasIndex(e => new { e.StartDate, e.EndDate })
                .HasDatabaseName("IX_AvailabilityRestriction_DateRange");

            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Alert>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.Code)
                .IsUnique()
                .HasDatabaseName("IX_Alert_Code");

            entity.HasIndex(e => e.ClinicId)
                .HasDatabaseName("IX_Alert_ClinicId");

            entity.HasIndex(e => new { e.IsResolved, e.CreatedAt })
                .HasDatabaseName("IX_Alert_IsResolved_CreatedAt");

            entity.Property(e => e.Code).HasMaxLength(64).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(300).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(4000).IsRequired();
            entity.Property(e => e.PrimaryActionLabel).HasMaxLength(120);
            entity.Property(e => e.SecondaryActionLabel).HasMaxLength(120);
            entity.Property(e => e.ResolutionNotes).HasMaxLength(2000);

            entity.HasOne(e => e.Clinic)
                .WithMany()
                .HasForeignKey(e => e.ClinicId)
                .OnDelete(DeleteBehavior.SetNull);

            // Two FKs to User — Restrict to avoid multiple cascade paths.
            entity.HasOne(e => e.RelatedUser)
                .WithMany()
                .HasForeignKey(e => e.RelatedUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ResolvedByUser)
                .WithMany()
                .HasForeignKey(e => e.ResolvedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
