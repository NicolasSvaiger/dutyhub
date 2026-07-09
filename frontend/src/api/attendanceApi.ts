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
   * Batch sync offline events with the backend.
   * POST /api/attendance/sync
   */
  syncOfflineEvents: async (events: OfflineAttendanceEvent[]): Promise<SyncResponse> => {
    const { data } = await axiosInstance.post<SyncResponse>('/attendance/sync', { events });
    return data;
  },
};

export default attendanceApi;
