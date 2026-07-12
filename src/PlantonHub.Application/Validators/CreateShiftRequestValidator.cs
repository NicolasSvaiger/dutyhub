using FluentValidation;
using PlantonHub.Application.DTOs.Shifts;

namespace PlantonHub.Application.Validators;

public class CreateShiftRequestValidator : AbstractValidator<CreateShiftRequest>
{
    public CreateShiftRequestValidator()
    {
        RuleFor(x => x.ClinicId)
            .NotEmpty().WithMessage("O campo clínica é obrigatório.");

        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("O campo título é obrigatório.")
            .MaximumLength(200).WithMessage("O campo título deve ter no máximo 200 caracteres.");

        RuleFor(x => x.Date)
            .NotEmpty().WithMessage("O campo data é obrigatório.");

        RuleFor(x => x.StartTime)
            .NotEmpty().WithMessage("O campo hora de início é obrigatório.");

        RuleFor(x => x.EndTime)
            .NotEmpty().WithMessage("O campo hora de término é obrigatório.");

        // Note: EndTime < StartTime is valid for overnight shifts (e.g., 22:00 - 06:00)
        // Only reject if both are equal (zero-length shift)
        RuleFor(x => x)
            .Must(x => x.StartTime != x.EndTime)
            .WithMessage("A hora de início e término não podem ser iguais.");
    }
}
