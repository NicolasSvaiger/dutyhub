import axiosInstance from './axiosInstance';
import type { Attendance, CheckInRequest, CheckOutRequest } from '../types';
import type { OfflineAttendanceEvent } from '../types/offlineEvent';

/** Result for a single event in a batch sync response */
export interface SyncEventResult {
  localEventId: string;
  status: 'Synced' | 'Rejected' | 'DuplicateIgnored' | 'RequiresReview';
  message?: string;
}

/** Response from POST /api/attendance/sync */
export interface SyncResponse {
  results: SyncEventResult[];
}

/** Info do check-in ativo retornado pelo /attendance/status */
export interface ActiveAttendanceInfo {
  id: string;
  shiftId: string;
  clinicId: string;
  clinicName: string;
  checkInTime: string;
}

/** Shift disponível para check-in hoje */
export interface AvailableShiftInfo {
  shiftId: string;
  clinicId: string;
  title: string;
  startTime: string;
  endTime: string;
}

/** Response do GET /attendance/status — estado unificado do profissional */
export interface AttendanceStatusResponse {
  hasActiveCheckIn: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  activeAttendance: ActiveAttendanceInfo | null;
  availableShiftsToday: AvailableShiftInfo[];
}

// ── Tempo Real (painel admin) ───────────────────────────────────────────────

export type LiveAttendanceStatus = 'Presente' | 'Atrasado' | 'Ausente' | 'Escalado';
export type ClinicLiveStatus = 'Ok' | 'Atencao' | 'Critico';

export interface LiveShiftProfessional {
  userId: string;
  userName: string;
  status: LiveAttendanceStatus;
  checkInTime: string | null;
}

export interface LiveShift {
  shiftId: string;
  title: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  professionals: LiveShiftProfessional[];
  openSlots: number;
}

export interface LiveClinic {
  clinicId: string;
  clinicName: string;
  contractId: string | null;
  contractNumber: string | null;
  publicOrganName: string | null;
  status: ClinicLiveStatus;
  shifts: LiveShift[];
  presentCount: number;
  lateCount: number;
  absentCount: number;
  openSlotsCount: number;
  slaPercent: number;
  lastEventDescription: string | null;
  lastEventTime: string | null;
}

export interface LiveEvent {
  time: string;
  type: string;
  description: string;
  clinicName: string;
}

export interface LiveStatusResponse {
  clinics: LiveClinic[];
  recentEvents: LiveEvent[];
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  totalOpenSlots: number;
  overallSlaPercent: number;
}

export const attendanceApi = {
  checkIn: async (request: CheckInRequest): Promise<Attendance> => {
    const { data } = await axiosInstance.post<Attendance>('/attendance/check-in', request);
    return data;
  },

  checkOut: async (request: CheckOutRequest): Promise<Attendance> => {
    const { data } = await axiosInstance.post<Attendance>('/attendance/check-out', request);
    return data;
  },

  getMyHistory: async (): Promise<Attendance[]> => {
    const { data } = await axiosInstance.get<Attendance[]>('/attendance/my-history');
    return data;
  },

  /**
   * Active check-ins (no check-out yet) for the current user at the active clinic.
   * Used by the doctor check-out modal to know which shifts can be closed.
   *
   * The backend already scans across all authorized clinics regardless of
   * X-Clinic-Id, but we still forward the header for consistency / audit.
   */
  getActive: async (clinicId?: string): Promise<Attendance[]> => {
    const config = clinicId ? { headers: { 'X-Clinic-Id': clinicId } } : undefined;
    const { data } = await axiosInstance.get<Attendance[]>('/attendance/active', config);
    return data;
  },

  /**
   * Batch sync offline events with the backend.
   * POST /api/attendance/sync
   */
  syncOfflineEvents: async (events: OfflineAttendanceEvent[]): Promise<SyncResponse> => {
    const { data } = await axiosInstance.post<SyncResponse>('/attendance/sync', { events });
    return data;
  },

  /**
   * Estado unificado do profissional: check-in ativo, shifts de hoje,
   * decisões canCheckIn/canCheckOut. Uma única chamada substitui os antigos
   * getActive + getMyToday + lógica client-side.
   * GET /api/attendance/status
   */
  getStatus: async (clinicId?: string): Promise<AttendanceStatusResponse> => {
    const config = clinicId ? { headers: { 'X-Clinic-Id': clinicId } } : undefined;
    const { data } = await axiosInstance.get<AttendanceStatusResponse>('/attendance/status', config);
    return data;
  },

  /**
   * Painel "Tempo Real" do Admin OS: status de presença ao vivo por UPA/turno
   * hoje (presente/atrasado/ausente/escalado), agregado com estatísticas e
   * feed de eventos recentes. AdminGlobal vê todas as UPAs; AdminClinica vê
   * apenas as autorizadas.
   * GET /api/attendance/live-status
   */
  getLiveStatus: async (): Promise<LiveStatusResponse> => {
    const { data } = await axiosInstance.get<LiveStatusResponse>('/attendance/live-status');
    return data;
  },
};

export default attendanceApi;
