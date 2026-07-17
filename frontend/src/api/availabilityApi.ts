import axiosInstance from './axiosInstance';

// ── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Tipos de restrição — os labels equivalentes vêm calculados pelo backend em
 * `AvailabilityRestrictionResponse.typeLabel`. Aqui usamos o enum numérico do
 * backend porque é assim que a API serializa (System.Text.Json padrão).
 */
export type AvailabilityRestrictionType =
  | 'Ferias'
  | 'LicencaMedica'
  | 'AfastamentoAdministrativo'
  | 'RestricaoTurno'
  | 'DiasEspecificos';

/** Status computado hoje. */
export type AvailabilityStatus =
  | 'Disponivel'
  | 'Ferias'
  | 'Licenca'
  | 'Afastado'
  | 'Restricao';

export interface AvailabilityRestriction {
  id: string;
  userId: string;
  userName: string;
  userRegistrationNumber?: string | null;
  userProfessionalType?: string | null;

  type: AvailabilityRestrictionType;
  typeLabel: string;

  startDate: string;
  endDate: string;

  blockedShiftsMask?: number | null;
  blockedWeekdaysMask?: number | null;

  notes?: string | null;
  createdAt: string;
}

export interface ProfessionalAvailability {
  userId: string;
  userName: string;
  registrationNumber?: string | null;
  professionalType?: string | null;
  isActive: boolean;

  status: AvailabilityStatus;
  statusLabel: string;

  restrictions: AvailabilityRestriction[];
}

export interface CreateRestrictionRequest {
  userId: string;
  type: AvailabilityRestrictionType;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string;
  blockedShiftsMask?: number | null;
  blockedWeekdaysMask?: number | null;
  notes?: string | null;
}

// ── API ─────────────────────────────────────────────────────────────────────

export const availabilityApi = {
  /** Lista todos os profissionais visíveis com suas restrições + status hoje. */
  getAll: async (): Promise<ProfessionalAvailability[]> => {
    const { data } = await axiosInstance.get<ProfessionalAvailability[]>('/availability');
    return data;
  },

  /** Cria uma nova restrição de disponibilidade. */
  createRestriction: async (request: CreateRestrictionRequest): Promise<AvailabilityRestriction> => {
    const { data } = await axiosInstance.post<AvailabilityRestriction>('/availability/restrictions', request);
    return data;
  },

  /** Remove uma restrição existente. */
  deleteRestriction: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/availability/restrictions/${id}`);
  },
};

export default availabilityApi;
