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
};

export default attendanceApi;
