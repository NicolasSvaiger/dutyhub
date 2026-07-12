using FluentAssertions;
using FluentValidation.TestHelper;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.DTOs.Biometric;
using PlantonHub.Application.Validators;

namespace PlantonHub.UnitTests.Validators;

public class FaceLoginRequestValidatorTests
{
    private readonly FaceLoginRequestValidator _validator = new();

    [Fact]
    public void Valid_Request_PassesValidation()
    {
        var request = new FaceLoginRequest
        {
            Email = "medico@test.com",
            Embedding = new float[128],
            DeviceId = "device-123",
            Platform = "android",
        };

        var result = _validator.TestValidate(request);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void EmptyEmail_FailsValidation(string email)
    {
        var request = new FaceLoginRequest { Email = email, Embedding = new float[128], DeviceId = "d", Platform = "android" };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Email);
    }

    [Fact]
    public void InvalidEmail_FailsValidation()
    {
        var request = new FaceLoginRequest { Email = "not-an-email", Embedding = new float[128], DeviceId = "d", Platform = "android" };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Email);
    }

    [Fact]
    public void WrongEmbeddingSize_FailsValidation()
    {
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = new float[64], DeviceId = "d", Platform = "android" };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Embedding);
    }

    [Fact]
    public void EmptyEmbedding_FailsValidation()
    {
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = Array.Empty<float>(), DeviceId = "d", Platform = "android" };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Embedding);
    }

    [Fact]
    public void EmptyDeviceId_FailsValidation()
    {
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = new float[128], DeviceId = "", Platform = "android" };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.DeviceId);
    }

    [Fact]
    public void EmptyPlatform_FailsValidation()
    {
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = new float[128], DeviceId = "d", Platform = "" };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Platform);
    }

    [Theory]
    [InlineData("windows")]
    [InlineData("linux")]
    [InlineData("web")]
    public void InvalidPlatform_FailsValidation(string platform)
    {
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = new float[128], DeviceId = "d", Platform = platform };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Platform);
    }

    [Theory]
    [InlineData("android")]
    [InlineData("ios")]
    [InlineData("Android")]
    [InlineData("IOS")]
    public void ValidPlatform_PassesValidation(string platform)
    {
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = new float[128], DeviceId = "d", Platform = platform };
        var result = _validator.TestValidate(request);
        result.ShouldNotHaveValidationErrorFor(x => x.Platform);
    }
}

public class FaceVerifyRequestValidatorTests
{
    private readonly FaceVerifyRequestValidator _validator = new();

    [Fact]
    public void Valid128Embedding_PassesValidation()
    {
        var request = new FaceVerifyRequest { Embedding = new float[128] };
        var result = _validator.TestValidate(request);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void WrongSize_FailsValidation()
    {
        var request = new FaceVerifyRequest { Embedding = new float[64] };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Embedding);
    }

    [Fact]
    public void EmptyEmbedding_FailsValidation()
    {
        var request = new FaceVerifyRequest { Embedding = Array.Empty<float>() };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Embedding);
    }
}

public class FaceEnrollmentRequestValidatorTests
{
    private readonly FaceEnrollmentRequestValidator _validator = new();

    [Fact]
    public void Valid128Embedding_PassesValidation()
    {
        var request = new FaceEnrollmentRequest { Embedding = new float[128] };
        var result = _validator.TestValidate(request);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void WrongSize_FailsValidation()
    {
        var request = new FaceEnrollmentRequest { Embedding = new float[256] };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.Embedding);
    }

    [Fact]
    public void PhotoBase64TooLong_FailsValidation()
    {
        var request = new FaceEnrollmentRequest
        {
            Embedding = new float[128],
            PhotoBase64 = new string('A', 2_000_001), // Over 2MB
        };
        var result = _validator.TestValidate(request);
        result.ShouldHaveValidationErrorFor(x => x.PhotoBase64);
    }
}
