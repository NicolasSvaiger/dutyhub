using PlantonHub.Application.DTOs.Attendance;

namespace PlantonHub.Application.Interfaces;

public interface IAttendanceService
{
    Task<AttendanceResponse> CheckInAsync(CheckInRequest request);
    Task<AttendanceResponse> CheckOutAsync(CheckOutRequest request);
    Task<IEnumerable<AttendanceResponse>> GetMyHistoryAsync();

    /// <summary>
    /// Returns the currently-open check-ins (no check-out yet) of the logged-in user
    /// in the active clinic. Used by the doctor check-out modal to know which shifts
    /// can be closed right now.
    /// </summary>
    Task<IEnumerable<AttendanceResponse>> GetMyActiveAsync();

    /// <summary>
    /// Endpoint unificado que agrega toda a lógica necessária pro modal de
    /// check-in/check-out numa só resposta: check-in ativo, shifts disponíveis,
    /// decisão de canCheckIn/canCheckOut. O frontend não precisa fazer múltiplas
    /// chamadas nem decidir timing entre elas.
    /// </summary>
    Task<AttendanceStatusResponse> GetStatusAsync();
    Task<AttendanceSummaryResponse> GetSummaryAsync(DateTime? from, DateTime? to);

    /// <summary>
    /// Painel "Tempo Real" para AdminClinica/AdminGlobal: cruza os turnos de hoje
    /// (por UPA autorizada) com escalas e check-ins reais para calcular, por
    /// profissional, se está presente/atrasado/ausente/escalado — e agrega isso
    /// em estatísticas por UPA e um feed de eventos recentes.
    /// </summary>
    Task<LiveStatusResponse> GetLiveStatusAsync();
}
