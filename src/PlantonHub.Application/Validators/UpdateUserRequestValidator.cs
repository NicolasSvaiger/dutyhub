using FluentValidation;
using PlantonHub.Application.DTOs.Users;

namespace PlantonHub.Application.Validators;

public class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(200).WithMessage("O campo nome deve ter no máximo 200 caracteres.")
            .When(x => x.Name is not null);

        RuleFor(x => x.Email)
            .EmailAddress().WithMessage("O campo email deve ser um endereço de email válido.")
            .MaximumLength(256).WithMessage("O campo email deve ter no máximo 256 caracteres.")
            .When(x => !string.IsNullOrEmpty(x.Email));
    }
}
