import axiosInstance from './axiosInstance';
import type { Clinic, CreateClinicRequest } from '../types';

export const clinicsApi = {
  getAll: async (): Promise<Clinic[]> => {
    const { data } = await axiosInstance.get<Clinic[]>('/clinics');
    return data;
  },

  create: async (request: CreateClinicRequest): Promise<Clinic> => {
    const { data } = await axiosInstance.post<Clinic>('/clinics', request);
    return data;
  },
};

export default clinicsApi;
