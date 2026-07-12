import axiosInstance from './axiosInstance';
import type { PublicOrgan } from '../types';

export const publicOrgansApi = {
  getAll: async (): Promise<PublicOrgan[]> => {
    const { data } = await axiosInstance.get<PublicOrgan[]>('/public-organs');
    return data;
  },

  getById: async (id: string): Promise<PublicOrgan> => {
    const { data } = await axiosInstance.get<PublicOrgan>(`/public-organs/${id}`);
    return data;
  },
};

export default publicOrgansApi;
