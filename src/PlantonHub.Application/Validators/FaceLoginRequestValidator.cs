using FluentValidation;
using PlantonHub.Application.DTOs.Auth;

namespace PlantonHub.Application.Validators;

public class FaceLoginRequestValidator : AbstractValidator<FaceLoginRequest>
{
    private static readonly string[] AllowedPlatforms = { "android", "ios" };

    public FaceLoginRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email é obrigatório.")
            .EmailAddress().WithMessage("Email inválido.")
            .MaximumLength(256).WithMessage("Email deve ter no máximo 256 caracteres.");

        RuleFor(x => x.Embedding)
            .NotNull().WithMessage("Embedding é obrigatório.")
            .Must(e => e.Length == 128).WithMessage("Embedding deve ter exatamente 128 dimensões.");

        RuleFor(x => x.DeviceId)
            .NotEmpty().WithMessage("DeviceId é obrigatório.")
            .MaximumLength(100).WithMessage("DeviceId deve ter no máximo 100 caracteres.");

        RuleFor(x => x.Platform)
            .NotEmpty().WithMessage("Platform é obrigatório (android/ios).")
            .Must(p => AllowedPlatforms.Contains(p.ToLowerInvariant()))
            .WithMessage("Platform deve ser 'android' ou 'ios'.");

        RuleFor(x => x.DeviceModel)
            .MaximumLength(200).WithMessage("DeviceModel deve ter no máximo 200 caracteres.")
            .When(x => x.DeviceModel is not null);
    }
}
