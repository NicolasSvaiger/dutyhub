namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// KPIs agregados por período — consumido por <c>PrefeituraKpis.tsx</c>.
/// Retorna todos os cards do mockup <c>op-kpis.html</c> num único payload
/// para evitar 4-5 chamadas em série. Filtros de período aplicados a
/// tudo — os totais são do intervalo, os breakdowns são por UPA.
/// </summary>
public class PrefeituraKpisResponse
{
    public DateTime From { get; set; }
    public DateTime To { get; set; }

    /// <summary>Taxa global de cumprimento no período (0..100).</summary>
    public double GlobalComplianceRate { get; set; }

    public int TotalExpectedShifts { get; set; }
    public int TotalCoveredShifts { get; set; }
    public int TotalAbsences { get; set; }
    public int TotalLateEvents { get; set; }

    /// <summary>Média de minutos de atraso entre eventos com atraso.</summary>
    public double AverageLateMinutes { get; set; }

    /// <summary>Percentual de plantões com substituto acionado.</summary>
    public double SubstitutionRate { get; set; }

    /// <summary>Profissionais distintos (médicos + enfermeiros) com ao menos
    /// um plantão escalado no período. Nome mantido por compatibilidade —
    /// ver <see cref="TotalActiveMedicos"/>/<see cref="TotalActiveEnfermeiros"/>
    /// para o breakdown por tipo.</summary>
    public int TotalActiveDoctors { get; set; }

    /// <summary>Subconjunto de <see cref="TotalActiveDoctors"/> com ProfessionalType == Medico.</summary>
    public int TotalActiveMedicos { get; set; }

    /// <summary>Subconjunto de <see cref="TotalActiveDoctors"/> com ProfessionalType == Enfermeiro.</summary>
    public int TotalActiveEnfermeiros { get; set; }

    /// <summary>Breakdown por UPA — mesmos KPIs por clínica.</summary>
    public List<PrefeituraKpiByClinic> ByClinic { get; set; } = new();

    /// <summary>Top 5 médicos com mais ausências no período (Absences > 0), ordenado desc.</summary>
    public List<PrefeituraKpiDoctorItem> TopAbsenceDoctors { get; set; } = new();

    /// <summary>Médicos com 100% de cumprimento (sem ausências nem atrasos) no período.</summary>
    public List<PrefeituraKpiDoctorItem> PerfectAttendanceDoctors { get; set; } = new();
}

public class PrefeituraKpiByClinic
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public double ComplianceRate { get; set; }
    public int ExpectedShifts { get; set; }
    public int CoveredShifts { get; set; }
    public int Absences { get; set; }
    public int LateEvents { get; set; }
}

/// <summary>Linha de ranking por médico — usado nos cards "Maiores ausências" e "Melhor frequência".</summary>
public class PrefeituraKpiDoctorItem
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }

    /// <summary>"Medico" | "Enfermeiro" — de <c>User.ProfessionalType</c>.</summary>
    public string? ProfessionalType { get; set; }

    /// <summary>UPA "âncora" — onde o profissional mais atuou no período (heurística de maioria).</summary>
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public int Absences { get; set; }
    public double ComplianceRate { get; set; }
}
