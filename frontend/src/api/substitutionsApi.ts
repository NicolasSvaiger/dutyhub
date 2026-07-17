import axiosInstance from './axiosInstance';
import type { Substitution, CreateSubstitutionRequest, AssignSubstituteRequest } from '../types';

export const substitutionsApi = {
  getAll: async (): Promise<Substitution[]> => {
    const { data } = await axiosInstance.get<Substitution[]>('/substitutions');
    return data;
  },

  getById: async (id: string): Promise<Substitution> => {
    const { data } = await axiosInstance.get<Substitution>(`/substitutions/${id}`);
    return data;
  },

  create: async (request: CreateSubstitutionRequest): Promise<Substitution> => {
    const { data } = await axiosInstance.post<Substitution>('/substitutions', request);
    return data;
  },

  assignSubstitute: async (id: string, request: AssignSubstituteRequest): Promise<Substitution> => {
    const { data } = await axiosInstance.post<Substitution>(`/substitutions/${id}/assign`, request);
    return data;
  },

  cancel: async (id: string): Promise<Substitution> => {
    const { data } = await axiosInstance.post<Substitution>(`/substitutions/${id}/cancel`);
    return data;
  },
};

export default substitutionsApi;
