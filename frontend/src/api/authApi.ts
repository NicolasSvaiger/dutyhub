import axiosInstance from './axiosInstance';

export interface LoginResponse {
  token: string;
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await axiosInstance.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    return data;
  },

  refreshToken: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    const { data } = await axiosInstance.post<RefreshTokenResponse>(
      '/auth/refresh-token',
      { refreshToken }
    );
    return data;
  },
};

export default authApi;
