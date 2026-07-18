import axiosInstance from './axiosInstance';

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface PrefeituraDashboardAlert {
  id: string;
  code: string;
  /** "critical" | "warning" | "info" | "resolved" — o backend serializa em lowercase. */
  level: string;
  title: string;
  clinicName?: string | null;
  createdAt: string;
}

export interface PrefeituraDashboardResponse {
  asOf: string;
  periodLabel: string;
  todayComplianceRate: number;
  todayExpectedShifts: number;
  todayCoveredShifts: number;
  todayOpenAbsences: number;
  todayLateEvents: number;
  clinicCount: number;
  recentAlerts: PrefeituraDashboardAlert[];
}

export interface PrefeituraKpiByClinic {
  clinicId: string;
  clinicName: string;
  complianceRate: number;
  expectedShifts: number;
  coveredShifts: number;
  absences: number;
  lateEvents: number;
}

export interface PrefeituraKpisResponse {
  from: string;
  to: string;
  globalComplianceRate: number;
  totalExpectedShifts: number;
  totalCoveredShifts: number;
  totalAbsences: number;
  totalLateEvents: number;
  averageLateMinutes: number;
  substitutionRate: number;
  byClinic: PrefeituraKpiByClinic[];
}

export interface PrefeituraClinicItem {
  clinicId: string;
  name: string;
  address?: string | null;
  contractNumber?: string | null;
}

export interface PrefeituraShiftAssignment {
  userId: string;
  userName: string;
  hasCheckedIn: boolean;
}

export interface PrefeituraShiftItem {
  shiftId: string;
  clinicId: string;
  clinicName: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  assignments: PrefeituraShiftAssignment[];
  checkedInCount: number;
}

export interface PrefeituraFrequencyItem {
  clinicId: string;
  clinicName: string;
  date: string;
  expected: number;
  actual: number;
  presenceRate: number;
}

export interface PrefeituraAbsenceItem {
  id: string;
  /** "late" | "absence" — vem do backend em lowercase. */
  type: string;
  userId: string;
  userName: string;
  clinicId: string;
  clinicName: string;
  date: string;
  shiftLabel: string;
  minutesLate?: number | null;
  justified: boolean;
  substituteName?: string | null;
}

export interface PrefeituraHistoryItem {
  timestamp: string;
  /** "checkin" | "absence" | "substitution" | "alert" | "justification". */
  type: string;
  title: string;
  details?: string | null;
  userId?: string | null;
  userName?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
}

export interface PrefeituraHistoryPage {
  items: PrefeituraHistoryItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PrefeituraRealtimeClinic {
  clinicId: string;
  name: string;
  expectedCount: number;
  presentCount: number;
  absentCount: number;
  /** "green" | "yellow" | "red". */
  alertLevel: string;
  absentUserNames: string[];
}

export interface PrefeituraRealtimeResponse {
  asOf: string;
  clinics: PrefeituraRealtimeClinic[];
  totalClinics: number;
  totalExpectedNow: number;
  totalPresentNow: number;
  totalAbsentNow: number;
}

export interface NotifyOsResponse {
  alertId: string;
  createdAt: string;
}

export type ReportType = 'kpis' | 'frequency' | 'atrasos' | 'ausencias' | 'history';
export type ReportFormat = 'pdf' | 'xlsx';

export interface ReportDownloadFilters {
  from?: string;
  to?: string;
  clinicId?: string;
  filter?: string;
  search?: string;
}

// ── API ─────────────────────────────────────────────────────────────────────

/**
 * Utilitário: converte Date/string em ISO date-only ("yyyy-MM-dd"). Aceita
 * qualquer input truthy; retorna undefined pra permitir omitir o param.
 */
function toIsoDate(value?: Date | string): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}

export const prefeituraApi = {
  // ── Reads ──────────────────────────────────────────────────────────────

  getDashboard: async (): Promise<PrefeituraDashboardResponse> => {
    const { data } = await axiosInstance.get<PrefeituraDashboardResponse>('/prefeitura/dashboard');
    return data;
  },

  getKpis: async (from?: Date | string, to?: Date | string): Promise<PrefeituraKpisResponse> => {
    const params: Record<string, string> = {};
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    const { data } = await axiosInstance.get<PrefeituraKpisResponse>('/prefeitura/kpis', { params });
    return data;
  },

  getClinics: async (): Promise<PrefeituraClinicItem[]> => {
    const { data } = await axiosInstance.get<PrefeituraClinicItem[]>('/prefeitura/clinics');
    return data;
  },

  getShifts: async (
    from?: Date | string,
    to?: Date | string,
    clinicId?: string,
  ): Promise<PrefeituraShiftItem[]> => {
    const params: Record<string, string> = {};
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (clinicId) params.clinicId = clinicId;
    const { data } = await axiosInstance.get<PrefeituraShiftItem[]>('/prefeitura/shifts', { params });
    return data;
  },

  getFrequency: async (
    from?: Date | string,
    to?: Date | string,
    clinicId?: string,
  ): Promise<PrefeituraFrequencyItem[]> => {
    const params: Record<string, string> = {};
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (clinicId) params.clinicId = clinicId;
    const { data } = await axiosInstance.get<PrefeituraFrequencyItem[]>('/prefeitura/frequency', { params });
    return data;
  },

  getAbsences: async (
    from?: Date | string,
    to?: Date | string,
    type?: 'late' | 'absence',
  ): Promise<PrefeituraAbsenceItem[]> => {
    const params: Record<string, string> = {};
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (type) params.type = type;
    const { data } = await axiosInstance.get<PrefeituraAbsenceItem[]>('/prefeitura/absences', { params });
    return data;
  },

  getHistory: async (
    from?: Date | string,
    to?: Date | string,
    type?: string,
    search?: string,
    page: number = 1,
    pageSize: number = 30,
  ): Promise<PrefeituraHistoryPage> => {
    const params: Record<string, string | number> = { page, pageSize };
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (type) params.type = type;
    if (search) params.search = search;
    const { data } = await axiosInstance.get<PrefeituraHistoryPage>('/prefeitura/history', { params });
    return data;
  },

  getRealtime: async (): Promise<PrefeituraRealtimeResponse> => {
    const { data } = await axiosInstance.get<PrefeituraRealtimeResponse>('/prefeitura/realtime');
    return data;
  },

  // ── Mutações e binários ────────────────────────────────────────────────

  /**
   * Acionar OS: gestor sinaliza ausência crítica. Backend cria um Alert
   * visível no Admin OS. Não altera dados operacionais.
   */
  notifyOs: async (
    shiftId: string,
    userId: string,
    message?: string,
  ): Promise<NotifyOsResponse> => {
    const { data } = await axiosInstance.post<NotifyOsResponse>('/prefeitura/absences/notify-os', {
      shiftId,
      userId,
      message,
    });
    return data;
  },

  /**
   * Download autenticado de relatório PDF/Excel. Usa responseType=blob porque
   * <a href> direto não passa o Bearer token. Parseia o Content-Disposition
   * pra preservar o filename gerado pelo backend; se ausente, usa fallback.
   * Dispara o download programaticamente via <a download>.
   */
  downloadReport: async (
    reportType: ReportType,
    format: ReportFormat,
    filters: ReportDownloadFilters = {},
  ): Promise<void> => {
    const params: Record<string, string> = { format };
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.clinicId) params.clinicId = filters.clinicId;
    if (filters.filter) params.filter = filters.filter;
    if (filters.search) params.search = filters.search;

    const response = await axiosInstance.get<Blob>(
      `/prefeitura/reports/${reportType}/export`,
      { params, responseType: 'blob' },
    );

    const disposition = response.headers['content-disposition'] ?? '';
    const filename =
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `${reportType}.${format}`;

    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export default prefeituraApi;
