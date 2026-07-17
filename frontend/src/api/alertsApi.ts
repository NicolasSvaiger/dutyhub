import axiosInstance from './axiosInstance';
import type { Alert, AlertsSummary, CreateAlertRequest, ResolveAlertRequest } from '../types';

export const alertsApi = {
  getAll: async (): Promise<Alert[]> => {
    const { data } = await axiosInstance.get<Alert[]>('/alerts');
    return data;
  },

  getSummary: async (): Promise<AlertsSummary> => {
    const { data } = await axiosInstance.get<AlertsSummary>('/alerts/summary');
    return data;
  },

  getById: async (id: string): Promise<Alert> => {
    const { data } = await axiosInstance.get<Alert>(`/alerts/${id}`);
    return data;
  },

  create: async (request: CreateAlertRequest): Promise<Alert> => {
    const { data } = await axiosInstance.post<Alert>('/alerts', request);
    return data;
  },

  resolve: async (id: string, request?: ResolveAlertRequest): Promise<Alert> => {
    const { data } = await axiosInstance.post<Alert>(`/alerts/${id}/resolve`, request ?? {});
    return data;
  },

  resolveAll: async (): Promise<{ resolved: number }> => {
    const { data } = await axiosInstance.post<{ resolved: number }>('/alerts/resolve-all');
    return data;
  },
};

export default alertsApi;
