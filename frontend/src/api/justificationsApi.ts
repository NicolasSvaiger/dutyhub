import axiosInstance from './axiosInstance';
import type { Justification, CreateJustificationRequest, RespondJustificationRequest } from '../types';

export const justificationsApi = {
  getAll: async (): Promise<Justification[]> => {
    const { data } = await axiosInstance.get<Justification[]>('/justifications');
    return data;
  },

  getById: async (id: string): Promise<Justification> => {
    const { data } = await axiosInstance.get<Justification>(`/justifications/${id}`);
    return data;
  },

  create: async (request: CreateJustificationRequest): Promise<Justification> => {
    const { data } = await axiosInstance.post<Justification>('/justifications', request);
    return data;
  },

  startAnalysis: async (id: string): Promise<Justification> => {
    const { data } = await axiosInstance.post<Justification>(`/justifications/${id}/start-analysis`);
    return data;
  },

  respond: async (id: string, request: RespondJustificationRequest): Promise<Justification> => {
    const { data } = await axiosInstance.post<Justification>(`/justifications/${id}/respond`, request);
    return data;
  },
};

export default justificationsApi;
