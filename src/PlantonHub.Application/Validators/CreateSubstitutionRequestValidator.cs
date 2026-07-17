using FluentValidation;
using PlantonHub.Application.DTOs.Substitutions;

namespace PlantonHub.Application.Validators;

public class CreateSubstitutionRequestValidator : AbstractValidator<CreateSubstitutionRequest>
{
    public CreateSubstitutionRequestValidator()
    {
        RuleFor(x => x.ClinicId)
            .NotEmpty().WithMessage("O campo UPA é obrigatório.");

        RuleFor(x => x.ShiftDate)
            .NotEmpty().WithMessage("O campo data do plantão é obrigatório.");

        RuleFor(x => x.ShiftLabel)
            .NotEmpty().WithMessage("O campo turno é obrigatório.")
            .MaximumLength(200).WithMessage("O campo turno deve ter no máximo 200 caracteres.");

        RuleFor(x => x.ReasonType)
            .IsInEnum().WithMessage("Tipo de ocorrência inválido.");

        RuleFor(x => x.AbsentUserId)
            .NotEmpty().WithMessage("O campo médico ausente é obrigatório.");

        RuleFor(x => x.Notes)
            .MaximumLength(2000).WithMessage("O campo observação deve ter no máximo 2000 caracteres.");

        RuleFor(x => x)
            .Must(x => x.SubstituteUserId != x.AbsentUserId || x.SubstituteUserId is null)
            .WithMessage("O substituto não pode ser o mesmo profissional ausente.");
    }
}
