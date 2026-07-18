import axiosInstance from './axiosInstance';

// ── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Vista de um gestor público — usuário com role <c>GestorPublico</c>
 * vinculado a um <c>PublicOrgan</c>. Espelha
 * <c>Application/DTOs/Gestores/GestorResponse.cs</c>.
 */
export interface GestorResponse {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  cargo?: string | null;
  publicOrganId: string;
  publicOrganName: string;
  publicOrganAcronym?: string | null;
  isActive: boolean;
  createdAt: string;
  assignedAt: string;
}

export interface CreateGestorRequest {
  name: string;
  email: string;
  phone?: string;
  cargo?: string;
  publicOrganId: string;
}

export interface UpdateGestorRequest {
  name?: string;
  phone?: string;
  cargo?: string;
}

// ── API ─────────────────────────────────────────────────────────────────────

export const gestoresApi = {
  /**
   * Lista gestores cadastrados. Filtro opcional por publicOrganId — Admin
   * OS usa quando o gestor tá associado a um contrato específico.
   * AdminGlobal + AdminClinica podem chamar (a OS precisa saber quem
   * opera cada UPA); a UI oculta o botão "Novo" quando AdminClinica.
   */
  getAll: async (publicOrganId?: string): Promise<GestorResponse[]> => {
    const params: Record<string, string> = {};
    if (publicOrganId) params.publicOrganId = publicOrganId;
    const { data } = await axiosInstance.get<GestorResponse[]>('/admin/gestores', { params });
    return data;
  },

  getById: async (id: string): Promise<GestorResponse> => {
    const { data } = await axiosInstance.get<GestorResponse>(`/admin/gestores/${id}`);
    return data;
  },

  /**
   * Cadastra um novo gestor. Backend orquestra Postgres + Cognito
   * (senha temporária + email de convite) + UserPublicOrganRole, com
   * rollback compensatório em falhas parciais. Apenas AdminGlobal.
   */
  create: async (request: CreateGestorRequest): Promise<GestorResponse> => {
    const { data } = await axiosInstance.post<GestorResponse>('/admin/gestores', request);
    return data;
  },

  /**
   * Atualiza campos editáveis (name, phone, cargo). Email e
   * publicOrganId são imutáveis — troca de vínculo é remove + create.
   * Apenas AdminGlobal.
   */
  update: async (id: string, request: UpdateGestorRequest): Promise<GestorResponse> => {
    const { data } = await axiosInstance.put<GestorResponse>(`/admin/gestores/${id}`, request);
    return data;
  },

  /**
   * Alterna IsActive. Apenas AdminGlobal.
   */
  toggleStatus: async (id: string): Promise<GestorResponse> => {
    const { data } = await axiosInstance.patch<GestorResponse>(`/admin/gestores/${id}/toggle-status`);
    return data;
  },

  /**
   * Remove o vínculo UserPublicOrganRole. O User em si é preservado
   * (LGPD). Apenas AdminGlobal.
   */
  remove: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/admin/gestores/${id}`);
  },
};

export default gestoresApi;
