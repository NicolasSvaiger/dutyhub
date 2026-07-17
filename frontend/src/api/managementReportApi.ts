import axiosInstance from './axiosInstance';

// ── Tipos ───────────────────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'flat';

export interface KpiWithTrend<T> {
  value: T;
  delta?: number | null;
  direction: TrendDirection;
  label: string;
}

export interface ContractsInSlaKpi {
  inSla: number;
  total: number;
  direction: TrendDirection;
  label: string;
}

export interface ContractSlaSummary {
  contractId: string;
  contractNumber: string;
  publicOrganName: string;
  startDate?: string | null;
  endDate?: string | null;
  slaPercent: number;
  targetPercent: number;
  clinicCount: number;
  absenceCount: number;
  monthlyValue?: number | null;
  status: 'ok' | 'warn' | 'crit';
}

export interface ClinicRankItem {
  clinicId: string;
  clinicName: string;
  slaPercent: number;
  position: number;
}

export interface ProblemDoctor {
  userId: string;
  userName: string;
  initials: string;
  clinicName?: string | null;
  occurrenceCount: number;
  absenceCount: number;
  lateCount: number;
}

export interface TrendCard {
  key: string;
  label: string;
  value: string;
  subLabel: string;
  direction: TrendDirection;
}

export interface EvolutionSeries {
  contractId: string;
  label: string;
  color: string;
  values: number[];
}

export interface SlaEvolution {
  months: string[];
  contractSeries: EvolutionSeries[];
  absencesByMonth: number[];
}

export interface MeetingHighlight {
  kind: 'pos' | 'neg' | 'neu';
  text: string;
}

export interface ManagementReportResponse {
  year: number;
  month: number;
  periodLabel: string;
  slaGlobal: KpiWithTrend<number>;
  totalAbsences: KpiWithTrend<number>;
  totalLateEvents: KpiWithTrend<number>;
  contractsInSla: ContractsInSlaKpi;
  contracts: ContractSlaSummary[];
  clinicRanking: ClinicRankItem[];
  problemDoctors: ProblemDoctor[];
  trends: TrendCard[];
  evolution: SlaEvolution;
  highlights: MeetingHighlight[];
}

// ── API ─────────────────────────────────────────────────────────────────────

export const managementReportApi = {
  /**
   * Busca o relatório gerencial consolidado do período. Sem argumentos usa o
   * mês corrente. Restrito ao papel AdminGlobal.
   */
  getReport: async (year?: number, month?: number): Promise<ManagementReportResponse> => {
    const params: Record<string, number> = {};
    if (year != null) params.year = year;
    if (month != null) params.month = month;
    const { data } = await axiosInstance.get<ManagementReportResponse>('/management-report', { params });
    return data;
  },
};

export default managementReportApi;
