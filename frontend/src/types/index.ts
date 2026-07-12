// TypeScript type definitions for entities and DTOs

export type { OfflineAttendanceEvent, AttendanceType, SyncStatus } from './offlineEvent';

// ===== Enums =====

export type RoleType = 'AdminGlobal' | 'AdminClinica' | 'Medico' | 'Enfermeiro' | 'Tecnico';

// ===== Domain Entities =====

export interface User {
  id: string;
  email: string;
  name: string;
  professionalType?: string | null;
  isActive: boolean;
  cpf?: string | null;
  phone?: string | null;
  registrationNumber?: string | null;
  specialty?: string | null;
  employmentType?: string | null;
  dateOfBirth?: string | null;
  createdAt: string;
  roles: UserClinicRole[];
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  requiredStaff: number;
  displayOrder: number;
  professionalType: string; // "Medico" or "Enfermeiro"
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  hasNursing: boolean;
  createdAt: string;
  shiftTemplates?: ShiftTemplate[];

  // Geolocation
  latitude?: number | null;
  longitude?: number | null;
  allowedRadiusMeters?: number | null;

  // Unit details
  capacity?: number | null;
  doctorsPerShift?: number | null;

  // Address breakdown
  city?: string | null;
  neighborhood?: string | null;
  zipCode?: string | null;
}

export interface UserClinicRole {
  id: string;
  userId: string;
  clinicId: string;
  role: RoleType;
  assignedAt: string;
}

export interface Shift {
  id: string;
  clinicId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  assignments: ShiftAssignment[];
}

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  userId: string;
  assignedAt: string;
  userName?: string;
}

export interface Attendance {
  id: string;
  userId: string;
  shiftId: string;
  clinicId: string;
  checkInTime: string;
  checkInLatitude: number;
  checkInLongitude: number;
  checkInDeviceId: string;
  biometricValidated: boolean;
  checkOutTime?: string;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkOutDeviceId?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  timestamp: string;
  operation: string;
  entity: string;
  entityId: string;
  details: string;
}

// ===== Auth DTOs =====

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

// ===== Clinic DTOs =====

export interface CreateClinicRequest {
  name: string;
  address: string;
  phone: string;
  latitude?: number | null;
  longitude?: number | null;
  allowedRadiusMeters?: number | null;
  capacity?: number | null;
  doctorsPerShift?: number | null;
  hasNursing?: boolean;
  city?: string | null;
  neighborhood?: string | null;
  zipCode?: string | null;
}

export interface UpdateClinicRequest {
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  allowedRadiusMeters?: number | null;
  capacity?: number | null;
  doctorsPerShift?: number | null;
  hasNursing?: boolean;
  city?: string | null;
  neighborhood?: string | null;
  zipCode?: string | null;
}

// ===== User DTOs =====

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  professionalType?: number;
  cpf?: string;
  phone?: string;
  registrationNumber?: string;
  specialty?: string;
  employmentType?: string;
  dateOfBirth?: string;
}

export interface AssignRoleRequest {
  clinicId: string;
  role: RoleType;
}

// ===== Shift DTOs =====

export interface CreateShiftRequest {
  clinicId?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface AssignShiftRequest {
  userId: string;
}

// ===== Attendance DTOs =====

export interface CheckInRequest {
  shiftId: string;
  latitude: number;
  longitude: number;
  deviceId: string;
  biometricValidated: boolean;
}

export interface CheckOutRequest {
  shiftId: string;
  latitude: number;
  longitude: number;
  deviceId: string;
}
