using FluentValidation;
using PlantonHub.Application.DTOs.Justifications;

namespace PlantonHub.Application.Validators;

public class RespondJustificationRequestValidator : AbstractValidator<RespondJustificationRequest>
{
    public RespondJustificationRequestValidator()
    {
        RuleFor(x => x.ResponseText)
            .NotEmpty().WithMessage("A resposta formal é obrigatória.")
            .MaximumLength(4000).WithMessage("A resposta deve ter no máximo 4000 caracteres.");
    }
}
