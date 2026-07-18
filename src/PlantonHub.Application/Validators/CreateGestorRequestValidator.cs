using FluentValidation;
using PlantonHub.Application.DTOs.Gestores;

namespace PlantonHub.Application.Validators;

/// <summary>
/// Valida o payload de cadastro de gestor público. Regras de autorização
/// (só AdminGlobal cria) vivem no <c>GestorService</c> — aqui só forma
/// e tipo dos campos.
/// </summary>
public class CreateGestorRequestValidator : AbstractValidator<CreateGestorRequest>
{
    public CreateGestorRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("O nome é obrigatório.")
            .MaximumLength(200).WithMessage("O nome pode ter no máximo 200 caracteres.");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("O e-mail é obrigatório.")
            .EmailAddress().WithMessage("Informe um e-mail válido.")
            .MaximumLength(200).WithMessage("O e-mail pode ter no máximo 200 caracteres.");

        RuleFor(x => x.PublicOrganId)
            .NotEmpty().WithMessage("O órgão público é obrigatório.");

        RuleFor(x => x.Phone)
            .MaximumLength(30).WithMessage("O telefone pode ter no máximo 30 caracteres.")
            .When(x => !string.IsNullOrEmpty(x.Phone));

        RuleFor(x => x.Cargo)
            .MaximumLength(100).WithMessage("O cargo pode ter no máximo 100 caracteres.")
            .When(x => !string.IsNullOrEmpty(x.Cargo));
    }
}
