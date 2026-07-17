using FluentValidation;
using PlantonHub.Application.DTOs.Substitutions;

namespace PlantonHub.Application.Validators;

public class AssignSubstituteRequestValidator : AbstractValidator<AssignSubstituteRequest>
{
    public AssignSubstituteRequestValidator()
    {
        RuleFor(x => x.SubstituteUserId)
            .NotEmpty().WithMessage("O campo substituto é obrigatório.");
    }
}
