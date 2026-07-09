using FluentValidation;
using PlantonHub.Application.DTOs.Auth;

namespace PlantonHub.Application.Validators;

public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("O campo email é obrigatório.")
            .EmailAddress().WithMessage("O campo email deve ser um endereço de email válido.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("O campo senha é obrigatório.");
    }
}
