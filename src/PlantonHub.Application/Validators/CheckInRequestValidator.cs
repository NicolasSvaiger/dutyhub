using FluentValidation;
using PlantonHub.Application.DTOs.Attendance;

namespace PlantonHub.Application.Validators;

public class CheckInRequestValidator : AbstractValidator<CheckInRequest>
{
    public CheckInRequestValidator()
    {
        RuleFor(x => x.ShiftId)
            .NotEmpty().WithMessage("O campo plantão é obrigatório.");

        RuleFor(x => x.Latitude)
            .InclusiveBetween(-90, 90).WithMessage("Latitude deve estar entre -90 e 90.");

        RuleFor(x => x.Longitude)
            .InclusiveBetween(-180, 180).WithMessage("Longitude deve estar entre -180 e 180.");

        RuleFor(x => x.DeviceId)
            .NotEmpty().WithMessage("O campo identificador do dispositivo é obrigatório.")
            .MaximumLength(100).WithMessage("O identificador do dispositivo deve ter no máximo 100 caracteres.");
    }
}
