using FluentValidation;
using PlantonHub.Application.DTOs.Biometric;

namespace PlantonHub.Application.Validators;

public class FaceVerifyRequestValidator : AbstractValidator<FaceVerifyRequest>
{
    public FaceVerifyRequestValidator()
    {
        RuleFor(x => x.Embedding)
            .NotNull().WithMessage("Embedding é obrigatório.")
            .Must(e => e.Length == 128).WithMessage("Embedding deve ter exatamente 128 dimensões.");
    }
}
