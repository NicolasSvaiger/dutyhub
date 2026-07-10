using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Application.DTOs.Audit;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using AttendanceEntity = PlantonHub.Domain.Entities.Attendance;

namespace PlantonHub.PropertyTests.Audit;

/// <summary>
/// Feature: plantonhub-mvp, Property 14: Histórico é ordenado por data decrescente
/// For any set of attendance or audit records, when querying history, results SHALL be
/// returned in descending date/time order, guaranteeing most recent records appear first.
/// **Validates: Requirements 9.1, 10.2**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class HistoryOrderedByDescendingDatePropertyTests
{
    private static Gen<DateTime> TimestampGen =>
        Gen.Choose(2020, 2025).SelectMany(year =>
            Gen.Choose(1, 12).SelectMany(month =>
                Gen.Choose(1, 28).SelectMany(day =>
                    Gen.Choose(0, 23).SelectMany(hour =>
                        Gen.Choose(0, 59).Select(minute =>
                            new DateTime(year, month, day, hour, minute, 0, DateTimeKind.Utc))))));

    private static Gen<string> OperationGen => Gen.Elements("Create", "Update", "Delete");
    private static Gen<string> EntityGen => Gen.Elements("User", "Clinic", "Shift", "Attendance", "ShiftAssignment");

    [Property(MaxTest = 100)]
    public Property AuditLogs_AreReturnedInDescendingTimestampOrder()
    {
        var logsGen = from count in Gen.Choose(2, 20)
                      from logs in Gen.ListOf(count,
                          from id in Arb.Generate<Guid>()
                          from userId in Arb.Generate<Guid>()
                          from timestamp in TimestampGen
                          from operation in OperationGen
                          from entity in EntityGen
                          from entityId in Arb.Generate<Guid>()
                          select new AuditLog
                          {
                              Id = id,
                              UserId = userId,
                              Timestamp = timestamp,
                              Operation = operation,
                              Entity = entity,
                              EntityId = entityId.ToString(),
                              Details = $"{{\"action\":\"{operation}\"}}"
                          })
                      select logs.ToList();

        return Prop.ForAll(Arb.From(logsGen), logs =>
        {
            // Arrange
            var auditLogRepository = new Mock<IAuditLogRepository>();
            auditLogRepository.Setup(r => r.GetAllAsync())
                .ReturnsAsync(logs);

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);

            var service = new AuditService(auditLogRepository.Object, tenantService.Object);

            // Act
            var result = service.GetAllAsync().Result.ToList();

            // Assert: Results are ordered by Timestamp descending
            var isDescending = true;
            for (int i = 0; i < result.Count - 1; i++)
            {
                if (result[i].Timestamp < result[i + 1].Timestamp)
                {
                    isDescending = false;
                    break;
                }
            }

            return isDescending.ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property AttendanceHistory_IsReturnedInDescendingCheckInTimeOrder()
    {
        var recordsGen = from userId in Arb.Generate<Guid>()
                         from clinicId in Arb.Generate<Guid>()
                         from count in Gen.Choose(2, 15)
                         from records in Gen.ListOf(count,
                             from id in Arb.Generate<Guid>()
                             from shiftId in Arb.Generate<Guid>()
                             from checkInTime in TimestampGen
                             select new AttendanceEntity
                             {
                                 Id = id,
                                 UserId = userId,
                                 ShiftId = shiftId,
                                 ClinicId = clinicId,
                                 CheckInTime = checkInTime,
                                 CheckInLatitude = -23.5,
                                 CheckInLongitude = -46.6,
                                 CheckInDeviceId = "device-001",
                                 BiometricValidated = true
                             })
                         select new { userId, clinicId, records = records.ToList() };

        return Prop.ForAll(Arb.From(recordsGen), input =>
        {
            // Arrange
            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);
            // GetMyHistoryAsync agora agrega por todas as clínicas autorizadas.
            tenantService.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { input.clinicId });

            var shiftRepository = new Mock<IShiftRepository>();
            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.GetHistoryByUserAndClinicAsync(input.userId, input.clinicId))
                .ReturnsAsync(input.records);

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object);

            // Act
            var result = service.GetMyHistoryAsync().Result.ToList();

            // Assert: Results are ordered by CheckInTime descending
            var isDescending = true;
            for (int i = 0; i < result.Count - 1; i++)
            {
                if (result[i].CheckInTime < result[i + 1].CheckInTime)
                {
                    isDescending = false;
                    break;
                }
            }

            return isDescending.ToProperty();
        });
    }
}

/// <summary>
/// Feature: plantonhub-mvp, Property 15: Operações CUD geram registro de auditoria
/// For any create, update, or delete operation performed in the system, the system SHALL create
/// an AuditLog record containing UserId of the author, DateTime, operation type, affected entity,
/// and relevant operation data.
/// **Validates: Requirements 10.1**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class CudOperationsGenerateAuditLogPropertyTests
{
    private static Gen<string> OperationGen => Gen.Elements("Create", "Update", "Delete");
    private static Gen<string> EntityGen => Gen.Elements("User", "Clinic", "Shift", "Attendance", "ShiftAssignment");
    private static Gen<string> DetailsGen => Gen.Elements(
        "{\"name\":\"Test Clinic\"}",
        "{\"email\":\"user@test.com\"}",
        "{\"title\":\"Night Shift\"}",
        "{\"action\":\"assigned\"}",
        "{\"status\":\"checked-in\"}");

    [Property(MaxTest = 100)]
    public Property LogAsync_CreatesAuditLogWithCorrectUserId()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from operation in OperationGen
                       from entity in EntityGen
                       from entityId in Arb.Generate<Guid>()
                       from details in DetailsGen
                       select new { userId, operation, entity, entityId = entityId.ToString(), details };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange
            AuditLog? capturedLog = null;

            var auditLogRepository = new Mock<IAuditLogRepository>();
            auditLogRepository.Setup(r => r.AddAsync(It.IsAny<AuditLog>()))
                .Callback<AuditLog>(log => capturedLog = log)
                .Returns(Task.CompletedTask);

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);

            var service = new AuditService(auditLogRepository.Object, tenantService.Object);

            // Act
            service.LogAsync(input.operation, input.entity, input.entityId, input.details).Wait();

            // Assert: AuditLog created with correct UserId
            var hasCorrectUserId = capturedLog != null && capturedLog.UserId == input.userId;

            return hasCorrectUserId.ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property LogAsync_CreatesAuditLogWithAllRequiredFields()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from operation in OperationGen
                       from entity in EntityGen
                       from entityId in Arb.Generate<Guid>()
                       from details in DetailsGen
                       select new { userId, operation, entity, entityId = entityId.ToString(), details };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange
            AuditLog? capturedLog = null;
            var beforeCall = DateTime.UtcNow;

            var auditLogRepository = new Mock<IAuditLogRepository>();
            auditLogRepository.Setup(r => r.AddAsync(It.IsAny<AuditLog>()))
                .Callback<AuditLog>(log => capturedLog = log)
                .Returns(Task.CompletedTask);

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);

            var service = new AuditService(auditLogRepository.Object, tenantService.Object);

            // Act
            service.LogAsync(input.operation, input.entity, input.entityId, input.details).Wait();
            var afterCall = DateTime.UtcNow;

            // Assert: All required fields are present and correct
            var allFieldsPresent = capturedLog != null &&
                capturedLog.Id != Guid.Empty &&
                capturedLog.UserId == input.userId &&
                capturedLog.Timestamp >= beforeCall &&
                capturedLog.Timestamp <= afterCall &&
                capturedLog.Operation == input.operation &&
                capturedLog.Entity == input.entity &&
                capturedLog.EntityId == input.entityId &&
                capturedLog.Details == input.details;

            return allFieldsPresent.ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property LogAsync_PersistsAuditLogViaRepository()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from operation in OperationGen
                       from entity in EntityGen
                       from entityId in Arb.Generate<Guid>()
                       from details in DetailsGen
                       select new { userId, operation, entity, entityId = entityId.ToString(), details };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange
            var auditLogRepository = new Mock<IAuditLogRepository>();
            auditLogRepository.Setup(r => r.AddAsync(It.IsAny<AuditLog>()))
                .Returns(Task.CompletedTask);

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);

            var service = new AuditService(auditLogRepository.Object, tenantService.Object);

            // Act
            service.LogAsync(input.operation, input.entity, input.entityId, input.details).Wait();

            // Assert: AddAsync was called exactly once
            auditLogRepository.Verify(r => r.AddAsync(It.Is<AuditLog>(log =>
                log.Operation == input.operation &&
                log.Entity == input.entity &&
                log.EntityId == input.entityId &&
                log.Details == input.details &&
                log.UserId == input.userId
            )), Times.Once);

            return true.ToProperty();
        });
    }
}
