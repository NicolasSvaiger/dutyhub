using FluentValidation;
using PlantonHub.Application.DTOs.Users;

namespace PlantonHub.Application.Validators;

public class AssignRoleRequestValidator : AbstractValidator<AssignRoleRequest>
{
    public AssignRoleRequestValidator()
    {
        RuleFor(x => x.ClinicId)
            .NotEmpty().WithMessage("O campo clinicId é obrigatório.");

        // AssignRoleRequest cria UserClinicRole (escopo clínica), então só
        // aceita roles válidos nesse escopo: AdminGlobal=1..Tecnico=5.
        // GestorPublico=6 pertence ao escopo PublicOrgan (UserPublicOrganRole)
        // e tem seu próprio fluxo em Sprint 7B/7C.
        RuleFor(x => x.Role)
            .Must(role => (int)role >= 1 && (int)role <= 5)
            .WithMessage("O campo role deve ser um perfil válido (1-5).");
    }
}
