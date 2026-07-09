import axiosInstance from './axiosInstance';
import type { Shift, CreateShiftRequest, AssignShiftRequest, ShiftAssignment } from '../types';

export const shiftsApi = {
  getAll: async (): Promise<Shift[]> => {
    const { data } = await axiosInstance.get<Shift[]>('/shifts');
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
