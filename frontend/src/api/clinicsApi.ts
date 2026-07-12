import axiosInstance from './axiosInstance';
import type { Clinic, CreateClinicRequest, UpdateClinicRequest } from '../types';

export const clinicsApi = {
  getAll: async (): Promise<Clinic[]> => {
    const { data } = await axiosInstance.get<Clinic[]>('/clinics');
    return data;
  },

  create: async (request: CreateClinicRequest): Promise<Clinic> => {
    const { data } = await axiosInstance.post<Clinic>('/clinics', request);
    return data;
  },

  update: async (id: string, request: UpdateClinicRequest): Promise<Clinic> => {
    const { data } = await axiosInstance.put<Clinic>(`/clinics/${id}`, request);
    return data;
  },

  toggleStatus: async (id: string): Promise<Clinic> => {
    const { data } = await axiosInstance.patch<Clinic>(`/clinics/${id}/toggle-status`);
    return data;
  },

  upsertShiftTemplates: async (id: string, templates: {
    name: string;
    startTime: string;
    endTime: string;
    requiredStaff: number;
    displayOrder: number;
    professionalType: number;
  }[]): Promise<Clinic> => {
    const { data } = await axiosInstance.put<Clinic>(`/clinics/${id}/shift-templates`, { templates });
    return data;
  },
};

export default clinicsApi;
