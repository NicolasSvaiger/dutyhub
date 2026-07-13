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

  // Contract link
  contractId?: string | null;
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
  contractId?: string | null;
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
  contractId?: string | null;
}

// ===== PublicOrgan =====

export interface PublicOrgan {
  id: string;
  name: string;
  acronym?: string | null;
  cnpj?: string | null;
  department?: string | null;
  city?: string | null;
  state?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  isActive: boolean;
  createdAt: string;
  children: PublicOrgan[];
}

// ===== Contract =====

export type ContractStatus = 'Active' | 'Renewal' | 'Inactive';

export interface ContractClinicSummary {
  id: string;
  name: string;
  address?: string | null;
  isActive: boolean;
}

export interface Contract {
  id: string;
  contractNumber: string;
  publicOrganId: string;
  publicOrganName: string;
  publicOrganAcronym?: string | null;
  publicOrganCnpj?: string | null;
  publicOrganDepartment?: string | null;
  publicOrganContactName?: string | null;
  publicOrganContactEmail?: string | null;
  publicOrganContactPhone?: string | null;
  publicOrganCity?: string | null;
  publicOrganState?: string | null;
  monthlyValue?: number | null;
  startDate: string;
  endDate: string;
  minSlaPercent?: number | null;
  status: ContractStatus;
  statusLabel: string;
  notes?: string | null;
  createdAt: string;
  clinics: ContractClinicSummary[];
}

// ===== Contract DTOs =====

export interface CreateContractRequest {
  organName: string;
  organAcronym?: string | null;
  organCnpj?: string | null;
  organDepartment?: string | null;
  organContactName?: string | null;
  organContactEmail?: string | null;
  organContactPhone?: string | null;
  organCity?: string | null;
  organState?: string | null;
  contractNumber: string;
  monthlyValue?: number | null;
  startDate: string;
  endDate: string;
  minSlaPercent?: number | null;
  status: ContractStatus;
  notes?: string | null;
}

export interface UpdateContractRequest extends CreateContractRequest {}

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
