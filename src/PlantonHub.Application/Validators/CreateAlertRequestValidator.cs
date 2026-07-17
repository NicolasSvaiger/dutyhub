using FluentValidation;
using PlantonHub.Application.DTOs.Alerts;

namespace PlantonHub.Application.Validators;

public class CreateAlertRequestValidator : AbstractValidator<CreateAlertRequest>
{
    public CreateAlertRequestValidator()
    {
        RuleFor(x => x.Level).IsInEnum().WithMessage("Nível de alerta inválido.");
        RuleFor(x => x.Type).IsInEnum().WithMessage("Tipo de alerta inválido.");

        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("O título é obrigatório.")
            .MaximumLength(300).WithMessage("O título deve ter no máximo 300 caracteres.");

        RuleFor(x => x.Description)
            .NotEmpty().WithMessage("A descrição é obrigatória.")
            .MaximumLength(4000).WithMessage("A descrição deve ter no máximo 4000 caracteres.");

        RuleFor(x => x.PrimaryActionLabel).MaximumLength(120);
        RuleFor(x => x.SecondaryActionLabel).MaximumLength(120);
        RuleFor(x => x.Code).MaximumLength(64);
    }
}
