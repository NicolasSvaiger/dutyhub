import axiosInstance from './axiosInstance';
import type { Clinic, User, Shift } from '../types';
import type { NotificationItem } from './notificationsApi';

/** KPIs para o dashboard admin */
export interface AdminDashboardKpis {
  activeContracts: number;
  registeredDoctors: number;
  shiftsToday: number;
  shiftsConfirmedToday: number;
  pendingAlerts: number;
}

/** Resumo completo para a home admin */
export interface AdminDashboardSummary {
  kpis: AdminDashboardKpis;
  clinics: Clinic[];
  users: User[];
  shiftsToday: Shift[];
  alerts: NotificationItem[];
}

export const adminApi = {
  /**
   * Busca todos os dados necessários para o dashboard admin em paralelo.
   * Usa os endpoints existentes (clinics, users, shifts, notifications).
   */
  getDashboardSummary: async (): Promise<AdminDashboardSummary> => {
    const [clinicsRes, usersRes, shiftsRes, alertsRes] = await Promise.all([
      axiosInstance.get<Clinic[]>('/clinics'),
      axiosInstance.get<User[]>('/users'),
      axiosInstance.get<Shift[]>('/shifts'),
      axiosInstance.get<NotificationItem[]>('/notifications'),
    ]);

    const clinics = clinicsRes.data;
    const users = usersRes.data;
    const shifts = shiftsRes.data;
    const alerts = alertsRes.data;

    // Filtra médicos (role Medico em qualquer clínica)
    const doctors = users.filter(u =>
      u.roles.some(r => r.role === 'Medico')
    );

    // Plantões de hoje
    const today = new Date().toISOString().split('T')[0];
    const shiftsToday = shifts.filter(s => s.date === today);
    const shiftsConfirmedToday = shiftsToday.filter(s => s.assignments.length > 0);

    // Alertas não lidos
    const pendingAlerts = alerts.filter(a => !a.isRead);

    const kpis: AdminDashboardKpis = {
      activeContracts: clinics.filter(c => c.isActive).length,
      registeredDoctors: doctors.length,
      shiftsToday: shiftsToday.length,
      shiftsConfirmedToday: shiftsConfirmedToday.length,
      pendingAlerts: pendingAlerts.length,
    };

    return {
      kpis,
      clinics,
      users,
      shiftsToday,
      alerts,
    };
  },
};

export default adminApi;
