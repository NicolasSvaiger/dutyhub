import axiosInstance from './axiosInstance';

export interface ClinicToleranceDto {
  clinicId: string;
  clinicName: string;
  checkInToleranceMinutes: number | null;
}

export interface SystemSettingsResponse {
  checkInToleranceMinutes: number;
  absenceThresholdMinutes: number;
  checkInBlockAfterMinutes: number;
  notifyOnAbsence: boolean;
  clinicTolerances: ClinicToleranceDto[];
}

export interface ClinicToleranceUpdate {
  clinicId: string;
  checkInToleranceMinutes: number | null;
}

export interface UpdateSettingsRequest {
  checkInToleranceMinutes: number;
  absenceThresholdMinutes: number;
  checkInBlockAfterMinutes: number;
  notifyOnAbsence: boolean;
  clinicTolerances: ClinicToleranceUpdate[];
}

export const settingsApi = {
  get: async (): Promise<SystemSettingsResponse> => {
    const { data } = await axiosInstance.get<SystemSettingsResponse>('/settings');
    return data;
  },

  update: async (request: UpdateSettingsRequest): Promise<SystemSettingsResponse> => {
    const { data } = await axiosInstance.put<SystemSettingsResponse>('/settings', request);
    return data;
  },
};

export default settingsApi;
