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

export interface PrefeituraKpiDoctorItem {
  userId: string;
  userName: string;
  registrationNumber?: string | null;
  /** "Medico" | "Enfermeiro" | null. */
  professionalType?: string | null;
  clinicId: string;
  clinicName: string;
  absences: number;
  complianceRate: number;
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
  /** Profissionais distintos (médicos + enfermeiros). Nome mantido por
   * compatibilidade — ver totalActiveMedicos/totalActiveEnfermeiros pro
   * breakdown por tipo. */
  totalActiveDoctors: number;
  totalActiveMedicos: number;
  totalActiveEnfermeiros: number;
  byClinic: PrefeituraKpiByClinic[];
  topAbsenceDoctors: PrefeituraKpiDoctorItem[];
  perfectAttendanceDoctors: PrefeituraKpiDoctorItem[];
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

export interface PrefeituraScheduleAssignment2 {
  userId: string;
  userName: string;
  /** "Medico" | "Enfermeiro" | null. */
  professionalType?: string | null;
  /** "confirmado" | "pendente". */
  status: string;
}

export interface PrefeituraScheduleCell {
  date: string;
  assignments: PrefeituraScheduleAssignment2[];
  uncoveredCount: number;
}

export interface PrefeituraScheduleRow {
  /** "manha" | "tarde" | "noite". */
  turno: string;
  startTime: string;
  endTime: string;
  cells: PrefeituraScheduleCell[];
}

export interface PrefeituraWeeklyScheduleResponse {
  clinicId: string;
  clinicName: string;
  doctorsPerShiftTarget?: number | null;
  weekStart: string;
  weekEnd: string;
  days: string[];
  totalShiftSlots: number;
  totalConfirmed: number;
  totalPending: number;
  totalUncovered: number;
  totalDoctors: number;
  rows: PrefeituraScheduleRow[];
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

export interface PrefeituraFrequencyByDoctorItem {
  userId: string;
  userName: string;
  registrationNumber?: string | null;
  /** "Medico" | "Enfermeiro" | null. */
  professionalType?: string | null;
  clinicId: string;
  clinicName: string;
  expectedShifts: number;
  completedShifts: number;
  absences: number;
  lateEvents: number;
  complianceRate: number;
}

export interface PrefeituraAbsenceItem {
  id: string;
  /** "sem-justificativa" | "pendente" | "em-analise" | "resolvido" | null.
   * Null quando type === "late" (o mock só classifica ausências). */
  status?: string | null;
  /** "late" | "absence" — vem do backend em lowercase. */
  type: string;
  userId: string;
  userName: string;
  /** "Medico" | "Enfermeiro" | null. */
  professionalType?: string | null;
  clinicId: string;
  clinicName: string;
  date: string;
  shiftLabel: string;
  minutesLate?: number | null;
  justified: boolean;
  substituteName?: string | null;
}

export interface PrefeituraUnitTimelineItem {
  shiftId: string;
  userId: string;
  userName: string;
  /** "Medico" | "Enfermeiro" | null. */
  professionalType?: string | null;
  date: string;
  /** "manha" | "tarde" | "noite". */
  turno: string;
  expectedTime: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  /** "in" | "late" | "absent". */
  type: string;
  minutesLate?: number | null;
}

export interface PrefeituraUnitTimelineResponse {
  clinicId: string;
  clinicName: string;
  from: string;
  to: string;
  totalShifts: number;
  entradas: number;
  saidas: number;
  atrasos: number;
  ausencias: number;
  items: PrefeituraUnitTimelineItem[];
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

export interface PrefeituraRealtimeDoctor {
  userId: string;
  userName: string;
  registrationNumber?: string | null;
  /** "Medico" | "Enfermeiro" | null. */
  professionalType?: string | null;
  /** "present" | "late" | "absent" | "upcoming". */
  status: string;
  checkInTime?: string | null;
  expectedTime: string;
}

export interface PrefeituraRealtimeClinic {
  clinicId: string;
  name: string;
  expectedCount: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  /** "green" | "yellow" | "red". */
  alertLevel: string;
  absentUserNames: string[];
  /** "manha" | "tarde" | "noite" | null quando não há turno ativo agora. */
  turnoCode?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  doctors: PrefeituraRealtimeDoctor[];
  lastEventUserName?: string | null;
  /** "checkin" | "absence" | null. */
  lastEventType?: string | null;
  lastEventTime?: string | null;
}

export interface PrefeituraRealtimeEvent {
  timestamp: string;
  /** "checkin" | "late" | "checkout" | "absence". */
  type: string;
  userId?: string | null;
  userName?: string | null;
  clinicName?: string | null;
  minutesLate?: number | null;
}

export interface PrefeituraRealtimeResponse {
  asOf: string;
  clinics: PrefeituraRealtimeClinic[];
  totalClinics: number;
  totalExpectedNow: number;
  totalPresentNow: number;
  totalAbsentNow: number;
  totalLateNow: number;
  recentEvents: PrefeituraRealtimeEvent[];
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

  getFrequencyByDoctor: async (
    from?: Date | string,
    to?: Date | string,
    clinicId?: string,
  ): Promise<PrefeituraFrequencyByDoctorItem[]> => {
    const params: Record<string, string> = {};
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (clinicId) params.clinicId = clinicId;
    const { data } = await axiosInstance.get<PrefeituraFrequencyByDoctorItem[]>(
      '/prefeitura/frequency/by-doctor',
      { params },
    );
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
    toleranceMinutes?: number,
  ): Promise<PrefeituraAbsenceItem[]> => {
    const params: Record<string, string | number> = {};
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (type) params.type = type;
    if (toleranceMinutes != null) params.toleranceMinutes = toleranceMinutes;
    const { data } = await axiosInstance.get<PrefeituraAbsenceItem[]>('/prefeitura/absences', { params });
    return data;
  },

  getWeeklySchedule: async (
    clinicId: string,
    weekStart?: Date | string,
  ): Promise<PrefeituraWeeklyScheduleResponse> => {
    const params: Record<string, string> = { clinicId };
    const w = toIsoDate(weekStart);
    if (w) params.weekStart = w;
    const { data } = await axiosInstance.get<PrefeituraWeeklyScheduleResponse>(
      '/prefeitura/schedule/weekly',
      { params },
    );
    return data;
  },

  getUnitTimeline: async (
    clinicId: string,
    from?: Date | string,
    to?: Date | string,
    turno?: string,
  ): Promise<PrefeituraUnitTimelineResponse> => {
    const params: Record<string, string> = { clinicId };
    const f = toIsoDate(from);
    const t = toIsoDate(to);
    if (f) params.from = f;
    if (t) params.to = t;
    if (turno) params.turno = turno;
    const { data } = await axiosInstance.get<PrefeituraUnitTimelineResponse>(
      '/prefeitura/units/timeline',
      { params },
    );
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
