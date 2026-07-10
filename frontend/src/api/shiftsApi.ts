import axiosInstance from './axiosInstance';
import type { Shift, CreateShiftRequest, AssignShiftRequest, ShiftAssignment } from '../types';

export const shiftsApi = {
  getAll: async (): Promise<Shift[]> => {
    const { data } = await axiosInstance.get<Shift[]>('/shifts');
    return data;
  },

  /**
   * Shifts assigned to the currently-logged-in professional at the active clinic
   * (X-Clinic-Id header) for today. Used by the doctor check-in modal.
   *
   * @param clinicId Optional explicit clinicId to send as X-Clinic-Id. When
   *   provided, overrides the value the axios interceptor would pick from
   *   localStorage. Useful to avoid races when the user just switched clinics.
   */
  getMyToday: async (clinicId?: string): Promise<Shift[]> => {
    const config = clinicId ? { headers: { 'X-Clinic-Id': clinicId } } : undefined;
    const { data } = await axiosInstance.get<Shift[]>('/shifts/me/today', config);
    return data;
  },

  /**
   * All shifts assigned to the current professional across every authorized
   * clinic. Used by the "Plantões" screen (past + today + upcoming).
   */
  getMine: async (): Promise<Shift[]> => {
    const { data } = await axiosInstance.get<Shift[]>('/shifts/me');
    return data;
  },

  create: async (request: CreateShiftRequest): Promise<Shift> => {
    const { data } = await axiosInstance.post<Shift>('/shifts', request);
    return data;
  },

  assign: async (shiftId: string, request: AssignShiftRequest): Promise<ShiftAssignment> => {
    const { data } = await axiosInstance.post<ShiftAssignment>(
      `/shifts/${shiftId}/assign`,
      request
    );
    return data;
  },
};

export default shiftsApi;
