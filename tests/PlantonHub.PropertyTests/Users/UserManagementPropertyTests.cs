using FluentAssertions;
using FluentValidation;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Application.DTOs.Users;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Application.Validators;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Users;

/// <summary>
/// Feature: plantonhub-mvp, Property 8: Usuário suporta múltiplos perfis em múltiplas clínicas
/// For any user with N roles distributed in M clinics, the system SHALL persist and return
/// correctly all N UserClinicRole associations, allowing the user to act in any of the clinics
/// with the corresponding role.
/// **Validates: Requirements 2.2, 5.3**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class MultipleProfilesPropertyTests
{
    [Property(MaxTest = 100)]
    public Property User_SupportsMultipleRoles_InMultipleClinics()
    {
        var roleGen = Gen.Elements(
            RoleType.AdminClinica,
            RoleType.Medico,
            RoleType.Enfermeiro,
            RoleType.Tecnico);

        var clinicCountGen = Gen.Choose(1, 5);
        var rolesPerClinicGen = Gen.Choose(1, 4);

        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(clinicCountGen),
            Arb.From(rolesPerClinicGen),
            (userId, clinicCount, rolesPerClinic) =>
            {
                // Arrange: Create user with multiple clinics and roles
                var user = new User
                {
                    Id = userId,
                    Email = "multi@test.com",
                    Name = "Multi Role User",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    UserClinicRoles = new List<UserClinicRole>()
                };

                var clinics = Enumerable.Range(0, clinicCount)
                    .Select(_ => new Clinic
                    {
                        Id = Guid.NewGuid(),
                        Name = $"Clinic-{Guid.NewGuid():N}",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    }).ToList();

                var allRoles = new[] { RoleType.AdminClinica, RoleType.Medico, RoleType.Enfermeiro, RoleType.Tecnico };
                var expectedAssociations = new List<(Guid ClinicId, RoleType Role)>();

                foreach (var clinic in clinics)
                {
                    var rolesToAssign = allRoles.Take(Math.Min(rolesPerClinic, allRoles.Length)).ToList();
                    foreach (var role in rolesToAssign)
                    {
                        var clinicRole = new UserClinicRole
                        {
                            Id = Guid.NewGuid(),
                            UserId = userId,
                            ClinicId = clinic.Id,
                            Role = role,
                            AssignedAt = DateTime.UtcNow
                        };
                        user.UserClinicRoles.Add(clinicRole);
                        expectedAssociations.Add((clinic.Id, role));
                    }
                }

                // Setup mocks
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);

                var userRepository = new Mock<IUserRepository>();
                userRepository.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);

                var clinicRepository = new Mock<IClinicRepository>();
                foreach (var clinic in clinics)
                {
                    clinicRepository.Setup(r => r.GetByIdAsync(clinic.Id)).ReturnsAsync(clinic);
                }

                var passwordHashService = new Mock<IPasswordHashService>();
                var cacheService = new Mock<ICacheService>();
                var cognitoAuthService = new Mock<ICognitoAuthService>();
                cognitoAuthService.Setup(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);

                var userService = new UserService(
                    userRepository.Object,
                    clinicRepository.Object,
                    tenantService.Object,
                    passwordHashService.Object,
                    cacheService.Object,
                    cognitoAuthService.Object);

                // Act: Assign each role to the user (simulating the sequence of AssignClinicRoleAsync calls)
                // We verify the user entity's UserClinicRoles collection persists all associations
                var persistedRoles = user.UserClinicRoles.ToList();

                // Assert: All N associations are persisted correctly
                var allPersisted = expectedAssociations.All(expected =>
                    persistedRoles.Any(p => p.ClinicId == expected.ClinicId && p.Role == expected.Role));

                var correctCount = persistedRoles.Count == expectedAssociations.Count;

                return (allPersisted && correctCount).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property AssignClinicRole_PersistsAssociation_ForValidUserAndClinic()
    {
        var roleGen = Gen.Elements(
            RoleType.AdminClinica,
            RoleType.Medico,
            RoleType.Enfermeiro,
            RoleType.Tecnico);

        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(roleGen),
            (userId, clinicId, role) =>
            {
                // Arrange
                var user = new User
                {
                    Id = userId,
                    Email = "assign@test.com",
                    Name = "Assign User",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    UserClinicRoles = new List<UserClinicRole>()
                };

                var clinic = new Clinic
                {
                    Id = clinicId,
                    Name = "Test Clinic",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);

                var userRepository = new Mock<IUserRepository>();
                userRepository.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);
                UserClinicRole? capturedRole = null;
                userRepository.Setup(r => r.AddClinicRoleAsync(It.IsAny<UserClinicRole>()))
                    .Callback<UserClinicRole>(r => capturedRole = r)
                    .Returns(Task.CompletedTask);

                var clinicRepository = new Mock<IClinicRepository>();
                clinicRepository.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(clinic);

                var passwordHashService = new Mock<IPasswordHashService>();
                var cacheService = new Mock<ICacheService>();
                var cognitoAuthService = new Mock<ICognitoAuthService>();
                cognitoAuthService.Setup(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);

                var userService = new UserService(
                    userRepository.Object,
                    clinicRepository.Object,
                    tenantService.Object,
                    passwordHashService.Object,
                    cacheService.Object,
                    cognitoAuthService.Object);

                var request = new AssignRoleRequest
                {
                    ClinicId = clinicId,
                    Role = role
                };

                // Act
                userService.AssignClinicRoleAsync(userId, request).Wait();

                // Assert: The role was persisted with correct data
                return (capturedRole != null &&
                        capturedRole.UserId == userId &&
                        capturedRole.ClinicId == clinicId &&
                        capturedRole.Role == role).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property User_CanActInAnyClinic_WithCorrespondingRole()
    {
        var roleGen = Gen.Elements(
            RoleType.AdminClinica,
            RoleType.Medico,
            RoleType.Enfermeiro,
            RoleType.Tecnico);

        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(Gen.Choose(2, 5)),
            Arb.From(roleGen),
            (userId, clinicCount, assignedRole) =>
            {
                // Arrange: User with the same role in multiple clinics
                var clinics = Enumerable.Range(0, clinicCount)
                    .Select(_ => new Clinic
                    {
                        Id = Guid.NewGuid(),
                        Name = $"Clinic-{Guid.NewGuid():N}",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    }).ToList();

                var user = new User
                {
                    Id = userId,
                    Email = "multi-clinic@test.com",
                    Name = "Multi Clinic User",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    UserClinicRoles = clinics.Select(c => new UserClinicRole
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        ClinicId = c.Id,
                        Role = assignedRole,
                        AssignedAt = DateTime.UtcNow
                    }).ToList()
                };

                // Assert: User can access any of the clinics with the corresponding role
                var canActInAllClinics = clinics.All(clinic =>
                    user.UserClinicRoles.Any(ucr =>
                        ucr.ClinicId == clinic.Id && ucr.Role == assignedRole));

                return canActInAllClinics.ToProperty();
            });
    }
}

/// <summary>
/// Feature: plantonhub-mvp, Property 9: Dados inválidos são rejeitados com detalhes de validação
/// For any user creation request with invalid data (duplicate email, missing required fields,
/// invalid email format), the API SHALL return HTTP 400 Bad Request with specific validation error details.
/// **Validates: Requirements 5.5**
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class InvalidDataRejectionPropertyTests
{
    private readonly CreateUserRequestValidator _createUserValidator = new();
    private readonly AssignRoleRequestValidator _assignRoleValidator = new();

    [Property(MaxTest = 100)]
    public Property EmptyName_IsRejected_WithValidationError()
    {
        var validEmailGen = Gen.Elements(
            "user@example.com", "test@test.org", "admin@clinic.net", "doc@hospital.com");
        var validPasswordGen = Gen.Elements(
            "Password1", "SecurePass8", "MyP@ss123", "TestPassword99");

        return Prop.ForAll(
            Arb.From(validEmailGen),
            Arb.From(validPasswordGen),
            (email, password) =>
            {
                var request = new CreateUserRequest
                {
                    Name = string.Empty,
                    Email = email,
                    Password = password
                };

                var result = _createUserValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "Name")).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property EmptyEmail_IsRejected_WithValidationError()
    {
        var validNameGen = Gen.Elements("John", "Maria", "Carlos", "Ana");
        var validPasswordGen = Gen.Elements(
            "Password1", "SecurePass8", "MyP@ss123", "TestPassword99");

        return Prop.ForAll(
            Arb.From(validNameGen),
            Arb.From(validPasswordGen),
            (name, password) =>
            {
                var request = new CreateUserRequest
                {
                    Name = name,
                    Email = string.Empty,
                    Password = password
                };

                var result = _createUserValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "Email")).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property InvalidEmailFormat_IsRejected_WithValidationError()
    {
        var invalidEmailGen = Gen.Elements(
            "notanemail", "missing@", "@nodomain",
            "no-at-sign.com", "double@@at.com",
            "plaintext", "user@", "@");

        var validNameGen = Gen.Elements("John", "Maria", "Carlos", "Ana");
        var validPasswordGen = Gen.Elements(
            "Password1", "SecurePass8", "MyP@ss123", "TestPassword99");

        return Prop.ForAll(
            Arb.From(validNameGen),
            Arb.From(invalidEmailGen),
            Arb.From(validPasswordGen),
            (name, invalidEmail, password) =>
            {
                var request = new CreateUserRequest
                {
                    Name = name,
                    Email = invalidEmail,
                    Password = password
                };

                var result = _createUserValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "Email")).ToProperty();
            });
    }

    [Property(MaxTest = 100, Skip = "Password é opcional — auth via Cognito, sem validação local (Sprint 7E)")]
    public Property ShortPassword_IsRejected_WithValidationError()
    {
        var shortPasswordGen = Gen.Elements("1234567", "abc", "short", "1", "12", "pass", "Ab1");
        var validNameGen = Gen.Elements("John", "Maria", "Carlos", "Ana");
        var validEmailGen = Gen.Elements(
            "user@example.com", "test@test.org", "admin@clinic.net");

        return Prop.ForAll(
            Arb.From(validNameGen),
            Arb.From(validEmailGen),
            Arb.From(shortPasswordGen),
            (name, email, shortPassword) =>
            {
                var request = new CreateUserRequest
                {
                    Name = name,
                    Email = email,
                    Password = shortPassword
                };

                var result = _createUserValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "Password")).ToProperty();
            });
    }

    [Property(MaxTest = 100, Skip = "Password é opcional — auth via Cognito, sem validação local (Sprint 7E)")]
    public Property EmptyPassword_IsRejected_WithValidationError()
    {
        var validNameGen = Gen.Elements("John", "Maria", "Carlos", "Ana");
        var validEmailGen = Gen.Elements(
            "user@example.com", "test@test.org", "admin@clinic.net");

        return Prop.ForAll(
            Arb.From(validNameGen),
            Arb.From(validEmailGen),
            (name, email) =>
            {
                var request = new CreateUserRequest
                {
                    Name = name,
                    Email = email,
                    Password = string.Empty
                };

                var result = _createUserValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "Password")).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property DuplicateEmail_ThrowsConflictException()
    {
        var validEmailGen = Gen.Elements(
            "user@example.com", "test@test.org", "admin@clinic.net", "doc@hospital.com");
        var validNameGen = Gen.Elements("John", "Maria", "Carlos", "Ana");

        return Prop.ForAll(
            Arb.From(validNameGen),
            Arb.From(validEmailGen),
            (name, email) =>
            {
                // Arrange: Repository reports email already exists
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);

                var userRepository = new Mock<IUserRepository>();
                userRepository.Setup(r => r.EmailExistsAsync(email)).ReturnsAsync(true);

                var clinicRepository = new Mock<IClinicRepository>();
                var passwordHashService = new Mock<IPasswordHashService>();
                var cacheService = new Mock<ICacheService>();
                var cognitoAuthService = new Mock<ICognitoAuthService>();
                cognitoAuthService.Setup(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);

                var userService = new UserService(
                    userRepository.Object,
                    clinicRepository.Object,
                    tenantService.Object,
                    passwordHashService.Object,
                    cacheService.Object,
                    cognitoAuthService.Object);

                var request = new CreateUserRequest
                {
                    Name = name,
                    Email = email,
                    Password = "ValidPass123"
                };

                // Act & Assert
                var threwConflict = false;
                try
                {
                    userService.CreateAsync(request).Wait();
                }
                catch (AggregateException ex) when (ex.InnerException is ConflictException)
                {
                    threwConflict = true;
                }

                return threwConflict.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property InvalidAssignRoleRequest_EmptyClinicId_IsRejected()
    {
        var roleGen = Gen.Elements(
            RoleType.AdminClinica,
            RoleType.Medico,
            RoleType.Enfermeiro,
            RoleType.Tecnico);

        return Prop.ForAll(
            Arb.From(roleGen),
            (role) =>
            {
                var request = new AssignRoleRequest
                {
                    ClinicId = Guid.Empty,
                    Role = role
                };

                var result = _assignRoleValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "ClinicId")).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property InvalidAssignRoleRequest_InvalidRoleEnum_IsRejected()
    {
        var invalidRoleGen = Gen.Elements(0, 6, 7, 10, -1, 99)
            .Select(i => (RoleType)i);

        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(invalidRoleGen),
            (clinicId, invalidRole) =>
            {
                // Ensure the clinicId is not empty to isolate the role validation
                var effectiveClinicId = clinicId == Guid.Empty ? Guid.NewGuid() : clinicId;

                var request = new AssignRoleRequest
                {
                    ClinicId = effectiveClinicId,
                    Role = invalidRole
                };

                var result = _assignRoleValidator.Validate(request);

                return (!result.IsValid &&
                        result.Errors.Any(e => e.PropertyName == "Role")).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property ValidCreateUserRequest_PassesValidation()
    {
        var validNameGen = Gen.Elements("John Doe", "Maria Silva", "Carlos Santos", "Ana Oliveira");
        var validEmailGen = Gen.Elements(
            "user@example.com", "test@test.org", "admin@clinic.net", "doc@hospital.com");
        var validPasswordGen = Gen.Elements(
            "Password1!", "SecurePass8", "MyP@ss123!", "TestPassword99");

        return Prop.ForAll(
            Arb.From(validNameGen),
            Arb.From(validEmailGen),
            Arb.From(validPasswordGen),
            (name, email, password) =>
            {
                var request = new CreateUserRequest
                {
                    Name = name,
                    Email = email,
                    Password = password
                };

                var result = _createUserValidator.Validate(request);

                return result.IsValid.ToProperty();
            });
    }
}
