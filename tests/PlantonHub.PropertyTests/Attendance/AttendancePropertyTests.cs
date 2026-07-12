using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Attendance;

/// <summary>
/// Feature: plantonhub-mvp, Property 10: Check-in persiste registro completo de presença (round-trip)
/// For any valid check-in with geolocation data (latitude, longitude), deviceId and biometric flag,
/// the attendance record created SHALL contain all submitted fields, and when querying history,
/// the same data SHALL be returned integrally.
/// **Validates: Requirements 7.1, 9.2**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class CheckInRoundTripPropertyTests
{
    private static Gen<double> LatitudeGen => Gen.Choose(-90000, 90000).Select(i => i / 1000.0);
    private static Gen<double> LongitudeGen => Gen.Choose(-180000, 180000).Select(i => i / 1000.0);
    private static Gen<string> DeviceIdGen => Gen.Elements(
        "device-001", "device-002", "iphone-abc", "android-xyz", "tablet-123");

    [Property(MaxTest = 100)]
    public Property CheckIn_PersistsCompleteAttendanceRecord_RoundTrip()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from lat in LatitudeGen
                       from lng in LongitudeGen
                       from deviceId in DeviceIdGen
                       from biometric in Arb.Generate<bool>()
                       select new { userId, shiftId, clinicId, lat, lng, deviceId, biometric };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange
            Domain.Entities.Attendance? capturedAttendance = null;

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.HasActiveCheckInAsync(input.userId, input.shiftId))
                .ReturnsAsync(false);
            attendanceRepository.Setup(r => r.AddAsync(It.IsAny<Domain.Entities.Attendance>()))
                .Callback<Domain.Entities.Attendance>(a => capturedAttendance = a)
                .Returns(Task.CompletedTask);

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckInRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.lat,
                Longitude = input.lng,
                DeviceId = input.deviceId,
                BiometricValidated = input.biometric
            };

            // Act
            var response = service.CheckInAsync(request).Result;

            // Assert: The response contains all submitted fields
            var allFieldsMatch =
                response.UserId == input.userId &&
                response.ShiftId == input.shiftId &&
                response.ClinicId == input.clinicId &&
                response.CheckInLatitude == input.lat &&
                response.CheckInLongitude == input.lng &&
                response.CheckInDeviceId == input.deviceId &&
                response.BiometricValidated == input.biometric &&
                response.CheckOutTime == null &&
                response.CheckOutLatitude == null &&
                response.CheckOutLongitude == null &&
                response.CheckOutDeviceId == null;

            // Assert: Persisted entity matches
            var persistedCorrectly = capturedAttendance != null &&
                capturedAttendance.UserId == input.userId &&
                capturedAttendance.ShiftId == input.shiftId &&
                capturedAttendance.ClinicId == input.clinicId &&
                capturedAttendance.CheckInLatitude == input.lat &&
                capturedAttendance.CheckInLongitude == input.lng &&
                capturedAttendance.CheckInDeviceId == input.deviceId &&
                capturedAttendance.BiometricValidated == input.biometric;

            return (allFieldsMatch && persistedCorrectly).ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property CheckIn_HistoryReturnsPersistedData_Integrally()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from lat in LatitudeGen
                       from lng in LongitudeGen
                       from deviceId in DeviceIdGen
                       from biometric in Arb.Generate<bool>()
                       select new { userId, shiftId, clinicId, lat, lng, deviceId, biometric };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange: Simulate a persisted attendance record
            var attendance = new Domain.Entities.Attendance
            {
                Id = Guid.NewGuid(),
                UserId = input.userId,
                ShiftId = input.shiftId,
                ClinicId = input.clinicId,
                CheckInTime = DateTime.UtcNow,
                CheckInLatitude = input.lat,
                CheckInLongitude = input.lng,
                CheckInDeviceId = input.deviceId,
                BiometricValidated = input.biometric
            };

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);
            // GetMyHistoryAsync agora agrega por todas as clínicas autorizadas
            // (ver AttendanceService). O teste precisa expor a clínica do input.
            tenantService.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { input.clinicId });

            var shiftRepository = new Mock<IShiftRepository>();
            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.GetHistoryByUserAndClinicAsync(input.userId, input.clinicId))
                .ReturnsAsync(new[] { attendance });

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            // Act
            var history = service.GetMyHistoryAsync().Result.ToList();

            // Assert: History contains the record with all fields intact
            var record = history.Single();
            var allFieldsIntact =
                record.UserId == input.userId &&
                record.ShiftId == input.shiftId &&
                record.ClinicId == input.clinicId &&
                record.CheckInLatitude == input.lat &&
                record.CheckInLongitude == input.lng &&
                record.CheckInDeviceId == input.deviceId &&
                record.BiometricValidated == input.biometric;

            return allFieldsIntact.ToProperty();
        });
    }
}

/// <summary>
/// Feature: plantonhub-mvp, Property 11: Check-in duplicado é prevenido
/// For any shift that already has an active check-in (without corresponding check-out),
/// a second check-in attempt by the same professional SHALL be rejected with HTTP 409 Conflict,
/// maintaining the original record intact.
/// **Validates: Requirements 7.4**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class DuplicateCheckInPreventionPropertyTests
{
    private static Gen<double> LatitudeGen => Gen.Choose(-90000, 90000).Select(i => i / 1000.0);
    private static Gen<double> LongitudeGen => Gen.Choose(-180000, 180000).Select(i => i / 1000.0);
    private static Gen<string> DeviceIdGen => Gen.Elements(
        "device-001", "device-002", "iphone-abc", "android-xyz", "tablet-123");

    [Property(MaxTest = 100)]
    public Property DuplicateCheckIn_IsRejected_WithConflict()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from lat in LatitudeGen
                       from lng in LongitudeGen
                       from deviceId in DeviceIdGen
                       select new { userId, shiftId, clinicId, lat, lng, deviceId };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange: Shift already has an active check-in
            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.HasActiveCheckInAsync(input.userId, input.shiftId))
                .ReturnsAsync(true); // Already has active check-in
            // HasAnyActiveCheckInAsync é o guard global — precisa retornar true
            // pra que o CheckInAsync bloqueie antes de tentar AddAsync.
            attendanceRepository.Setup(r => r.HasAnyActiveCheckInAsync(input.userId))
                .ReturnsAsync(true);
            // O novo fluxo busca o active pra incluir no body do 409
            tenantService.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { input.clinicId });
            attendanceRepository.Setup(r => r.GetActiveByUserAndClinicAsync(input.userId, input.clinicId))
                .ReturnsAsync(new[] { new Domain.Entities.Attendance
                {
                    Id = Guid.NewGuid(),
                    UserId = input.userId,
                    ShiftId = input.shiftId,
                    ClinicId = input.clinicId,
                    CheckInTime = DateTime.UtcNow,
                    CheckInLatitude = input.lat,
                    CheckInLongitude = input.lng,
                    CheckInDeviceId = input.deviceId,
                    BiometricValidated = true,
                }});

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckInRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.lat,
                Longitude = input.lng,
                DeviceId = input.deviceId,
                BiometricValidated = true
            };

            // Act & Assert: Should throw ConflictException
            var threwConflict = false;
            try
            {
                service.CheckInAsync(request).Wait();
            }
            catch (AggregateException ex) when (ex.InnerException is ConflictException)
            {
                threwConflict = true;
            }

            return threwConflict.ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property DuplicateCheckIn_DoesNotModifyOriginalRecord()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from lat in LatitudeGen
                       from lng in LongitudeGen
                       from deviceId in DeviceIdGen
                       select new { userId, shiftId, clinicId, lat, lng, deviceId };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange
            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.HasActiveCheckInAsync(input.userId, input.shiftId))
                .ReturnsAsync(true);
            attendanceRepository.Setup(r => r.HasAnyActiveCheckInAsync(input.userId))
                .ReturnsAsync(true);
            tenantService.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { input.clinicId });
            attendanceRepository.Setup(r => r.GetActiveByUserAndClinicAsync(input.userId, input.clinicId))
                .ReturnsAsync(new[] { new Domain.Entities.Attendance
                {
                    Id = Guid.NewGuid(),
                    UserId = input.userId,
                    ShiftId = input.shiftId,
                    ClinicId = input.clinicId,
                    CheckInTime = DateTime.UtcNow,
                    CheckInLatitude = input.lat,
                    CheckInLongitude = input.lng,
                    CheckInDeviceId = input.deviceId,
                    BiometricValidated = true,
                }});

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckInRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.lat,
                Longitude = input.lng,
                DeviceId = input.deviceId,
                BiometricValidated = false
            };

            // Act: Attempt duplicate check-in
            try
            {
                service.CheckInAsync(request).Wait();
            }
            catch (AggregateException)
            {
                // Expected
            }

            // Assert: No AddAsync or UpdateAsync was called - original record untouched
            attendanceRepository.Verify(r => r.AddAsync(It.IsAny<Domain.Entities.Attendance>()), Times.Never);
            attendanceRepository.Verify(r => r.UpdateAsync(It.IsAny<Domain.Entities.Attendance>()), Times.Never);

            return true.ToProperty();
        });
    }
}

/// <summary>
/// Feature: plantonhub-mvp, Property 12: Check-out atualiza registro existente
/// For any attendance with active check-in, when performing check-out with valid data
/// (latitude, longitude, deviceId), the record SHALL be updated with exit data without
/// altering the original check-in data.
/// **Validates: Requirements 8.1**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class CheckOutUpdatesRecordPropertyTests
{
    private static Gen<double> LatitudeGen => Gen.Choose(-90000, 90000).Select(i => i / 1000.0);
    private static Gen<double> LongitudeGen => Gen.Choose(-180000, 180000).Select(i => i / 1000.0);
    private static Gen<string> DeviceIdGen => Gen.Elements(
        "device-001", "device-002", "iphone-abc", "android-xyz", "tablet-123");

    [Property(MaxTest = 100)]
    public Property CheckOut_UpdatesExitData_WithoutAlteringCheckInData()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from checkInLat in LatitudeGen
                       from checkInLng in LongitudeGen
                       from checkInDeviceId in DeviceIdGen
                       from biometric in Arb.Generate<bool>()
                       from checkOutLat in LatitudeGen
                       from checkOutLng in LongitudeGen
                       from checkOutDeviceId in DeviceIdGen
                       select new
                       {
                           userId, shiftId, clinicId,
                           checkInLat, checkInLng, checkInDeviceId, biometric,
                           checkOutLat, checkOutLng, checkOutDeviceId
                       };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange: Existing attendance with active check-in (no check-out yet)
            var checkInTime = DateTime.UtcNow.AddHours(-4);
            var existingAttendance = new Domain.Entities.Attendance
            {
                Id = Guid.NewGuid(),
                UserId = input.userId,
                ShiftId = input.shiftId,
                ClinicId = input.clinicId,
                CheckInTime = checkInTime,
                CheckInLatitude = input.checkInLat,
                CheckInLongitude = input.checkInLng,
                CheckInDeviceId = input.checkInDeviceId,
                BiometricValidated = input.biometric,
                CheckOutTime = null,
                CheckOutLatitude = null,
                CheckOutLongitude = null,
                CheckOutDeviceId = null
            };

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.GetByUserAndShiftAsync(input.userId, input.shiftId))
                .ReturnsAsync(existingAttendance);
            attendanceRepository.Setup(r => r.UpdateAsync(It.IsAny<Domain.Entities.Attendance>()))
                .Returns(Task.CompletedTask);

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckOutRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.checkOutLat,
                Longitude = input.checkOutLng,
                DeviceId = input.checkOutDeviceId
            };

            // Act
            var response = service.CheckOutAsync(request).Result;

            // Assert: Check-out data is set correctly
            var checkOutDataCorrect =
                response.CheckOutLatitude == input.checkOutLat &&
                response.CheckOutLongitude == input.checkOutLng &&
                response.CheckOutDeviceId == input.checkOutDeviceId &&
                response.CheckOutTime != null;

            // Assert: Original check-in data is NOT altered
            var checkInDataPreserved =
                response.CheckInTime == checkInTime &&
                response.CheckInLatitude == input.checkInLat &&
                response.CheckInLongitude == input.checkInLng &&
                response.CheckInDeviceId == input.checkInDeviceId &&
                response.BiometricValidated == input.biometric &&
                response.UserId == input.userId &&
                response.ShiftId == input.shiftId &&
                response.ClinicId == input.clinicId;

            return (checkOutDataCorrect && checkInDataPreserved).ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property CheckOut_CallsUpdateAsync_WithCorrectEntity()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from checkOutLat in LatitudeGen
                       from checkOutLng in LongitudeGen
                       from checkOutDeviceId in DeviceIdGen
                       select new { userId, shiftId, clinicId, checkOutLat, checkOutLng, checkOutDeviceId };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange
            var existingAttendance = new Domain.Entities.Attendance
            {
                Id = Guid.NewGuid(),
                UserId = input.userId,
                ShiftId = input.shiftId,
                ClinicId = input.clinicId,
                CheckInTime = DateTime.UtcNow.AddHours(-2),
                CheckInLatitude = -10.0,
                CheckInLongitude = -20.0,
                CheckInDeviceId = "original-device",
                BiometricValidated = true,
                CheckOutTime = null
            };

            Domain.Entities.Attendance? updatedEntity = null;

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.GetByUserAndShiftAsync(input.userId, input.shiftId))
                .ReturnsAsync(existingAttendance);
            attendanceRepository.Setup(r => r.UpdateAsync(It.IsAny<Domain.Entities.Attendance>()))
                .Callback<Domain.Entities.Attendance>(a => updatedEntity = a)
                .Returns(Task.CompletedTask);

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckOutRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.checkOutLat,
                Longitude = input.checkOutLng,
                DeviceId = input.checkOutDeviceId
            };

            // Act
            service.CheckOutAsync(request).Wait();

            // Assert: UpdateAsync was called with correct entity
            var updateCalledCorrectly = updatedEntity != null &&
                updatedEntity.CheckOutLatitude == input.checkOutLat &&
                updatedEntity.CheckOutLongitude == input.checkOutLng &&
                updatedEntity.CheckOutDeviceId == input.checkOutDeviceId &&
                updatedEntity.CheckOutTime != null;

            return updateCalledCorrectly.ToProperty();
        });
    }
}

/// <summary>
/// Feature: plantonhub-mvp, Property 13: Check-out requer check-in ativo
/// For any check-out attempt on a shift without a corresponding active check-in,
/// the API SHALL return HTTP 400 Bad Request indicating the absence of check-in.
/// **Validates: Requirements 8.3**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class CheckOutRequiresActiveCheckInPropertyTests
{
    private static Gen<double> LatitudeGen => Gen.Choose(-90000, 90000).Select(i => i / 1000.0);
    private static Gen<double> LongitudeGen => Gen.Choose(-180000, 180000).Select(i => i / 1000.0);
    private static Gen<string> DeviceIdGen => Gen.Elements(
        "device-001", "device-002", "iphone-abc", "android-xyz", "tablet-123");

    [Property(MaxTest = 100)]
    public Property CheckOut_WithoutActiveCheckIn_ReturnsBadRequest_WhenNoRecord()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from lat in LatitudeGen
                       from lng in LongitudeGen
                       from deviceId in DeviceIdGen
                       select new { userId, shiftId, clinicId, lat, lng, deviceId };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange: No attendance record exists for this shift
            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.GetByUserAndShiftAsync(input.userId, input.shiftId))
                .ReturnsAsync((Domain.Entities.Attendance?)null); // No record

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckOutRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.lat,
                Longitude = input.lng,
                DeviceId = input.deviceId
            };

            // Act & Assert
            var threwBadRequest = false;
            try
            {
                service.CheckOutAsync(request).Wait();
            }
            catch (AggregateException ex) when (ex.InnerException is BadRequestException)
            {
                threwBadRequest = true;
            }

            return threwBadRequest.ToProperty();
        });
    }

    [Property(MaxTest = 100)]
    public Property CheckOut_WithAlreadyCompletedCheckOut_ReturnsBadRequest()
    {
        var inputGen = from userId in Arb.Generate<Guid>()
                       from shiftId in Arb.Generate<Guid>()
                       from clinicId in Arb.Generate<Guid>()
                       from lat in LatitudeGen
                       from lng in LongitudeGen
                       from deviceId in DeviceIdGen
                       select new { userId, shiftId, clinicId, lat, lng, deviceId };

        return Prop.ForAll(Arb.From(inputGen), input =>
        {
            // Arrange: Attendance record exists but already has a check-out
            var completedAttendance = new Domain.Entities.Attendance
            {
                Id = Guid.NewGuid(),
                UserId = input.userId,
                ShiftId = input.shiftId,
                ClinicId = input.clinicId,
                CheckInTime = DateTime.UtcNow.AddHours(-8),
                CheckInLatitude = -23.0,
                CheckInLongitude = -46.0,
                CheckInDeviceId = "original-device",
                BiometricValidated = true,
                CheckOutTime = DateTime.UtcNow.AddHours(-2), // Already checked out
                CheckOutLatitude = -23.1,
                CheckOutLongitude = -46.1,
                CheckOutDeviceId = "checkout-device"
            };

            var tenantService = new Mock<ITenantService>();
            tenantService.Setup(t => t.GetCurrentUserId()).Returns(input.userId);
            tenantService.Setup(t => t.GetCurrentClinicId()).Returns(input.clinicId);

            var shiftRepository = new Mock<IShiftRepository>();
            shiftRepository.Setup(r => r.AssignmentExistsAsync(input.shiftId, input.userId))
                .ReturnsAsync(true);

            var attendanceRepository = new Mock<IAttendanceRepository>();
            attendanceRepository.Setup(r => r.GetByUserAndShiftAsync(input.userId, input.shiftId))
                .ReturnsAsync(completedAttendance);

            var service = new AttendanceService(
                attendanceRepository.Object,
                shiftRepository.Object,
                new Mock<IClinicRepository>().Object,
                tenantService.Object,
                new Mock<IFaceEnrollmentRepository>().Object,
                new Mock<IBiometricProofService>().Object);

            var request = new CheckOutRequest
            {
                ShiftId = input.shiftId,
                Latitude = input.lat,
                Longitude = input.lng,
                DeviceId = input.deviceId
            };

            // Act & Assert
            var threwBadRequest = false;
            try
            {
                service.CheckOutAsync(request).Wait();
            }
            catch (AggregateException ex) when (ex.InnerException is BadRequestException)
            {
                threwBadRequest = true;
            }

            return threwBadRequest.ToProperty();
        });
    }
}
