using FluentValidation;
using PlantonHub.Application.DTOs.Justifications;

namespace PlantonHub.Application.Validators;

public class CreateJustificationRequestValidator : AbstractValidator<CreateJustificationRequest>
{
    public CreateJustificationRequestValidator()
    {
        RuleFor(x => x.ClinicId)
            .NotEmpty().WithMessage("O campo UPA é obrigatório.");

        RuleFor(x => x.AbsentUserId)
            .NotEmpty().WithMessage("O campo médico é obrigatório.");

        RuleFor(x => x.ShiftDate)
            .NotEmpty().WithMessage("O campo data do plantão é obrigatório.");

        RuleFor(x => x.ShiftTurn)
            .NotEmpty().WithMessage("O campo turno é obrigatório.")
            .MaximumLength(64).WithMessage("O campo turno deve ter no máximo 64 caracteres.");

        RuleFor(x => x.RequestType)
            .IsInEnum().WithMessage("Tipo de acionamento inválido.");

        RuleFor(x => x.RequestText)
            .NotEmpty().WithMessage("O texto do acionamento é obrigatório.")
            .MaximumLength(4000).WithMessage("O texto deve ter no máximo 4000 caracteres.");

        RuleFor(x => x.DeadlineDate)
            .NotEmpty().WithMessage("O prazo de resposta é obrigatório.");

        RuleFor(x => x.ProtocolNumber)
            .MaximumLength(64).WithMessage("O protocolo deve ter no máximo 64 caracteres.");
    }
}
