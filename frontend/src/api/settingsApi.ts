import axiosInstance from './axiosInstance';

// ── Sub-types ──────────────────────────────────────────────────────────────

export interface ClinicToleranceDto {
  clinicId: string;
  clinicName: string;
  checkInToleranceMinutes: number | null;
}

export interface NotifChannelDto {
  email: boolean;
  sms: boolean;
  push: boolean;
}

// ── Response ──────────────────────────────────────────────────────────────

export interface SystemSettingsResponse {
  // Tolerâncias
  checkInToleranceMinutes: number;
  absenceThresholdMinutes: number;
  checkInBlockAfterMinutes: number;
  notifyOnAbsence: boolean;
  clinicTolerances: ClinicToleranceDto[];

  // Fusos
  systemTimezone: string;
  daylightSavingAuto: boolean;

  // Notificações
  notificationChannels: Record<string, NotifChannelDto>;
  emailSender: string;
  emailSenderName: string;
  emailCc: string;

  // Biometria
  biometricConfidencePercent: number;
  biometricMaxAttempts: number;
  biometricAllowManualCheckin: boolean;
  biometricLogFailedAttempt: boolean;
  azureEndpoint: string;
  azureRegion: string;

  // Sistema
  orgName: string;
  orgCnpj: string;
  orgEmail: string;
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  passwordRotationDays: number;
  detailedAuditLog: boolean;
}

// ── Request ───────────────────────────────────────────────────────────────

export interface ClinicToleranceUpdate {
  clinicId: string;
  checkInToleranceMinutes: number | null;
}

export interface NotifChannelUpdate {
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface UpdateSettingsRequest {
  // Tolerâncias
  checkInToleranceMinutes: number;
  absenceThresholdMinutes: number;
  checkInBlockAfterMinutes: number;
  notifyOnAbsence: boolean;
  clinicTolerances: ClinicToleranceUpdate[];

  // Fusos
  systemTimezone: string;
  daylightSavingAuto: boolean;

  // Notificações
  notificationChannels: Record<string, NotifChannelUpdate>;
  emailSender: string;
  emailSenderName: string;
  emailCc: string;

  // Biometria
  biometricConfidencePercent: number;
  biometricMaxAttempts: number;
  biometricAllowManualCheckin: boolean;
  biometricLogFailedAttempt: boolean;
  azureEndpoint: string;
  azureRegion: string;

  // Sistema
  orgName: string;
  orgCnpj: string;
  orgEmail: string;
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  passwordRotationDays: number;
  detailedAuditLog: boolean;
}

// ── API ───────────────────────────────────────────────────────────────────

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
