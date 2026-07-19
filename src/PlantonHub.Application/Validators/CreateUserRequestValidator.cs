using FluentValidation;
using PlantonHub.Application.DTOs.Users;

namespace PlantonHub.Application.Validators;

public class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("O campo nome é obrigatório.")
            .MaximumLength(200).WithMessage("O campo nome deve ter no máximo 200 caracteres.");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("O campo email é obrigatório.")
            .EmailAddress().WithMessage("O campo email deve ser um endereço de email válido.")
            .MaximumLength(256).WithMessage("O campo email deve ter no máximo 256 caracteres.");

        // Password não é mais validado — obsoleto, ver comentário no DTO.
        // Auth real é via Cognito (senha temporária gerada no backend).
    }
}
