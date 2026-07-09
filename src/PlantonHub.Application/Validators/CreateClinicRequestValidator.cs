using FluentValidation;
using PlantonHub.Application.DTOs.Clinics;

namespace PlantonHub.Application.Validators;

public class CreateClinicRequestValidator : AbstractValidator<CreateClinicRequest>
{
    public CreateClinicRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("O campo nome é obrigatório.")
            .MaximumLength(200).WithMessage("O campo nome deve ter no máximo 200 caracteres.");

        RuleFor(x => x.Address)
            .MaximumLength(500).WithMessage("O campo endereço deve ter no máximo 500 caracteres.");

        RuleFor(x => x.Phone)
            .MaximumLength(20).WithMessage("O campo telefone deve ter no máximo 20 caracteres.");
    }
}
