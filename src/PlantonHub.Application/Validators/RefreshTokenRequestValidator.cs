using FluentValidation;
using PlantonHub.Application.DTOs.Auth;

namespace PlantonHub.Application.Validators;

public class RefreshTokenRequestValidator : AbstractValidator<RefreshTokenRequest>
{
    public RefreshTokenRequestValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty().WithMessage("O campo refresh token é obrigatório.");
    }
}
