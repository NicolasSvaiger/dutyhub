using FluentValidation;
using PlantonHub.Application.DTOs.Biometric;

namespace PlantonHub.Application.Validators;

public class FaceEnrollmentRequestValidator : AbstractValidator<FaceEnrollmentRequest>
{
    public FaceEnrollmentRequestValidator()
    {
        RuleFor(x => x.Embedding)
            .NotNull().WithMessage("Embedding é obrigatório.")
            .Must(e => e.Length == 128).WithMessage("Embedding deve ter exatamente 128 dimensões.");

        RuleFor(x => x.PhotoBase64)
            .MaximumLength(2_000_000).WithMessage("Foto deve ter no máximo ~1.5MB em base64.")
            .When(x => x.PhotoBase64 is not null);
    }
}
