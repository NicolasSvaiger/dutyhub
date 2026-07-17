import axiosInstance from './axiosInstance';

// ── Tipos ───────────────────────────────────────────────────────────────────

export type AuditOperation =
  | 'Create' | 'Update' | 'Delete'
  | 'Login' | 'Logout'
  | 'Config' | 'Export' | 'System';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  dateLabel: string;
  timeLabel: string;

  userId: string;
  userName: string;
  userInitials: string;
  userRole?: string | null;

  operation: AuditOperation | string;
  operationLabel: string;

  module?: string | null;
  entity: string;
  entityId: string;

  action: string;
  details?: string | null;
  ipAddress?: string | null;
  beforeValue?: string | null;
  afterValue?: string | null;
}

export interface AuditKpis {
  totalEvents: number;
  creates: number;
  updates: number;
  deletes: number;
  logins: number;
}

export interface ModuleActivity {
  module: string;
  count: number;
  color: string;
}

export interface TopUserActivity {
  userId: string;
  userName: string;
  initials: string;
  role?: string | null;
  count: number;
  color: string;
}

export interface DailyCount {
  date: string;
  dayLabel: string;
  count: number;
}

export interface AuditSummaryResponse {
  kpis: AuditKpis;
  modules: ModuleActivity[];
  topUsers: TopUserActivity[];
  last7Days: DailyCount[];
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditQuery {
  from?: string;         // ISO date (YYYY-MM-DD)
  to?: string;
  userId?: string;
  module?: string;
  operation?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ── API ─────────────────────────────────────────────────────────────────────

export const auditApi = {
  /** Timeline paginada com filtros. Restrito a AdminGlobal. */
  getLogs: async (query: AuditQuery = {}): Promise<AuditLogPage> => {
    const params: Record<string, string | number> = {};
    if (query.from) params.from = query.from;
    if (query.to) params.to = query.to;
    if (query.userId) params.userId = query.userId;
    if (query.module) params.module = query.module;
    if (query.operation) params.operation = query.operation;
    if (query.search) params.search = query.search;
    if (query.page) params.page = query.page;
    if (query.pageSize) params.pageSize = query.pageSize;
    const { data } = await axiosInstance.get<AuditLogPage>('/audit/logs', { params });
    return data;
  },

  /** KPIs 30d + agregações laterais (módulos, top usuários, série 7d). */
  getSummary: async (): Promise<AuditSummaryResponse> => {
    const { data } = await axiosInstance.get<AuditSummaryResponse>('/audit/summary');
    return data;
  },
};

export default auditApi;
