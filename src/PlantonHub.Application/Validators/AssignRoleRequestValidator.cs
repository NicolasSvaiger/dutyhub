using FluentValidation;
using PlantonHub.Application.DTOs.Users;

namespace PlantonHub.Application.Validators;

public class AssignRoleRequestValidator : AbstractValidator<AssignRoleRequest>
{
    public AssignRoleRequestValidator()
    {
        RuleFor(x => x.ClinicId)
            .NotEmpty().WithMessage("O campo clinicId é obrigatório.");

        RuleFor(x => x.Role)
            .IsInEnum().WithMessage("O campo role deve ser um perfil válido (1-5).");
    }
}
