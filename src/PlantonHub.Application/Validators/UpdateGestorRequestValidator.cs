using FluentValidation;
using PlantonHub.Application.DTOs.Gestores;

namespace PlantonHub.Application.Validators;

/// <summary>
/// Valida o payload de edição de gestor. Todos os campos são opcionais
/// (null = "não alterar"); só validamos comprimento quando enviados.
/// </summary>
public class UpdateGestorRequestValidator : AbstractValidator<UpdateGestorRequest>
{
    public UpdateGestorRequestValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(200).WithMessage("O nome pode ter no máximo 200 caracteres.")
            .When(x => x.Name is not null);

        RuleFor(x => x.Phone)
            .MaximumLength(30).WithMessage("O telefone pode ter no máximo 30 caracteres.")
            .When(x => !string.IsNullOrEmpty(x.Phone));

        RuleFor(x => x.Cargo)
            .MaximumLength(100).WithMessage("O cargo pode ter no máximo 100 caracteres.")
            .When(x => !string.IsNullOrEmpty(x.Cargo));
    }
}
