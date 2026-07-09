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

        RuleFor(x => x.EndTime)
            .GreaterThan(x => x.StartTime)
            .WithMessage("A hora de término deve ser posterior à hora de início.");
    }
}
