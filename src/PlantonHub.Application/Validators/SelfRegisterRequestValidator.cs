using FluentValidation;
using PlantonHub.Application.DTOs.Registration;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.Validators;

public class SelfRegisterRequestValidator : AbstractValidator<SelfRegisterRequest>
{
    public SelfRegisterRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("O campo nome é obrigatório.")
            .MaximumLength(200).WithMessage("O campo nome deve ter no máximo 200 caracteres.");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("O campo email é obrigatório.")
            .EmailAddress().WithMessage("Email inválido.")
            .MaximumLength(256).WithMessage("O campo email deve ter no máximo 256 caracteres.");

        RuleFor(x => x.ProfessionalType)
            .NotNull().WithMessage("Tipo profissional é obrigatório.")
            .Must(t => t == ProfessionalType.Medico || t == ProfessionalType.Enfermeiro)
            .WithMessage("Tipo profissional deve ser Médico ou Enfermeiro.");

        RuleFor(x => x.ClinicIds)
            .NotEmpty().WithMessage("Selecione pelo menos uma UPA.");

        RuleForEach(x => x.ClinicIds)
            .NotEqual(Guid.Empty).WithMessage("UPA inválida.");

        // Biometria opcional por enquanto (migração para Techmag depois).
        // Se enviado, o embedding deve ter 128 dimensões (modelo atual).
        RuleFor(x => x.FaceEmbedding)
            .Must(e => e == null || e.Length == 0 || e.Length == 128)
            .WithMessage("Se enviado, o embedding facial deve ter 128 dimensões.");

        RuleFor(x => x.Cpf)
            .MaximumLength(20).When(x => x.Cpf is not null);

        RuleFor(x => x.Phone)
            .MaximumLength(20).When(x => x.Phone is not null);

        RuleFor(x => x.RegistrationNumber)
            .MaximumLength(50).When(x => x.RegistrationNumber is not null);
    }
}
