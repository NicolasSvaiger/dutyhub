import axiosInstance from './axiosInstance';
import type { User, CreateUserRequest, AssignRoleRequest, UserClinicRole } from '../types';

export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const { data } = await axiosInstance.get<User[]>('/users');
    return data;
  },

  getAdmins: async (): Promise<User[]> => {
    const { data } = await axiosInstance.get<User[]>('/users/admins');
    return data;
  },

  create: async (request: CreateUserRequest): Promise<User> => {
    const { data } = await axiosInstance.post<User>('/users', request);
    return data;
  },

  assignRole: async (userId: string, request: AssignRoleRequest): Promise<UserClinicRole> => {
    const { data } = await axiosInstance.post<UserClinicRole>(
      `/users/${userId}/clinic-role`,
      request
    );
    return data;
  },

  toggleStatus: async (userId: string): Promise<User> => {
    const { data } = await axiosInstance.patch<User>(`/users/${userId}/toggle-status`);
    return data;
  },
};

export default usersApi;
