import axiosInstance from './axiosInstance';
import type { Contract } from '../types';

export const contractsApi = {
  getAll: async (): Promise<Contract[]> => {
    const { data } = await axiosInstance.get<Contract[]>('/contracts');
    return data;
  },

  getById: async (id: string): Promise<Contract> => {
    const { data } = await axiosInstance.get<Contract>(`/contracts/${id}`);
    return data;
  },
};

export default contractsApi;
