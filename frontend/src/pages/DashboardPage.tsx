import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useClinic } from '../hooks/useClinic';
import axiosInstance from '../api/axiosInstance';
import type { Shift, Clinic, User } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const { activeClinic } = useClinic();

  const roles = user?.roles ?? [];
  const isAdminGlobal = roles.includes('AdminGlobal');
  const isAdminClinica = roles.includes('AdminClinica');
  const isProfessional =
    roles.includes('Medico') || roles.includes('Enfermeiro') || roles.includes('Tecnico');

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>
        Bem-vindo, <strong>{user?.email}</strong>
      </p>
      <p>
        Perfis: <em>{roles.join(', ')}</em>
      </p>
      {activeClinic && (
        <p>
          Clínica ativa: <strong>{activeClinic.name}</strong>
        </p>
      )}

      {isAdminGlobal && <AdminGlobalPanel />}
      {isAdminClinica && !isAdminGlobal && <AdminClinicaPanel />}
      {isProfessional && <ProfessionalPanel />}
    </div>
  );
}

function AdminGlobalPanel() {
  const [clinicCount, setClinicCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clinicsRes, usersRes] = await Promise.all([
          axiosInstance.get<Clinic[]>('/clinics'),
          axiosInstance.get<User[]>('/users'),
        ]);
        setClinicCount(clinicsRes.data.length);
        setUserCount(usersRes.data.length);
      } catch {
        // Silently handle errors for dashboard counts
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, []);

  if (loading) return <p>Carregando dados...</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Painel Administrativo Global</h2>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
          <h3>{clinicCount ?? '—'}</h3>
          <p>Clínicas</p>
        </div>
        <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
          <h3>{userCount ?? '—'}</h3>
          <p>Usuários</p>
        </div>
      </div>
    </div>
  );
}

function AdminClinicaPanel() {
  const [shiftCount, setShiftCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axiosInstance.get<Shift[]>('/shifts');
        setShiftCount(res.data.length);
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, []);

  if (loading) return <p>Carregando dados...</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Painel da Clínica</h2>
      <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
        <h3>{shiftCount ?? '—'}</h3>
        <p>Plantões na clínica</p>
      </div>
    </div>
  );
}

function ProfessionalPanel() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axiosInstance.get<Shift[]>('/shifts');
        setShifts(res.data);
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, []);

  if (loading) return <p>Carregando dados...</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Meus Próximos Plantões</h2>
      {shifts.length === 0 ? (
        <p>Nenhum plantão atribuído.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {shifts.map((shift) => (
            <li
              key={shift.id}
              style={{ padding: 12, border: '1px solid #eee', marginBottom: 8, borderRadius: 4 }}
            >
              <strong>{shift.title}</strong>
              <br />
              Data: {shift.date} | {shift.startTime} - {shift.endTime}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
