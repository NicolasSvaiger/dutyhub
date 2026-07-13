import axiosInstance from './axiosInstance';
import type { Contract, CreateContractRequest, UpdateContractRequest } from '../types';

export const contractsApi = {
  getAll: async (): Promise<Contract[]> => {
    const { data } = await axiosInstance.get<Contract[]>('/contracts');
    return data;
  },

  getById: async (id: string): Promise<Contract> => {
    const { data } = await axiosInstance.get<Contract>(`/contracts/${id}`);
    return data;
  },

  create: async (request: CreateContractRequest): Promise<Contract> => {
    const { data } = await axiosInstance.post<Contract>('/contracts', request);
    return data;
  },

  update: async (id: string, request: UpdateContractRequest): Promise<Contract> => {
    const { data } = await axiosInstance.put<Contract>(`/contracts/${id}`, request);
    return data;
  },
};

export default contractsApi;
