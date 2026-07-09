import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useClinic } from '../hooks/useClinic';
import axiosInstance from '../api/axiosInstance';
import type { Shift, CreateShiftRequest } from '../types';

export function ShiftsPage() {
  const { user } = useAuth();
  const { activeClinic } = useClinic();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roles = user?.roles ?? [];
  const isAdminClinica = roles.includes('AdminClinica');

  const fetchShifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get<Shift[]>('/shifts');
      setShifts(res.data);
    } catch {
      setError('Erro ao carregar plantões.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchShifts();
  }, [activeClinic]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Plantões</h1>
      {activeClinic && (
        <p>
          Clínica: <strong>{activeClinic.name}</strong>
        </p>
      )}

      {isAdminClinica && <CreateShiftForm onCreated={fetchShifts} />}

      {loading && <p>Carregando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && shifts.length === 0 && <p>Nenhum plantão encontrado.</p>}

      {!loading && !error && shifts.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Título</th>
              <th style={{ padding: 8 }}>Data</th>
              <th style={{ padding: 8 }}>Início</th>
              <th style={{ padding: 8 }}>Fim</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{shift.title}</td>
                <td style={{ padding: 8 }}>{shift.date}</td>
                <td style={{ padding: 8 }}>{shift.startTime}</td>
                <td style={{ padding: 8 }}>{shift.endTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateShiftForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: CreateShiftRequest = { title, date, startTime, endTime };

    try {
      await axiosInstance.post('/shifts', payload);
      setTitle('');
      setDate('');
      setStartTime('');
      setEndTime('');
      onCreated();
    } catch {
      setError('Erro ao criar plantão.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
      <h2>Criar Plantão</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label htmlFor="shift-title" style={{ display: 'block', fontSize: 12 }}>Título</label>
          <input
            id="shift-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="shift-date" style={{ display: 'block', fontSize: 12 }}>Data</label>
          <input
            id="shift-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="shift-start" style={{ display: 'block', fontSize: 12 }}>Início</label>
          <input
            id="shift-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="shift-end" style={{ display: 'block', fontSize: 12 }}>Fim</label>
          <input
            id="shift-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <button type="submit" disabled={submitting} style={{ padding: '6px 16px' }}>
          {submitting ? 'Criando...' : 'Criar'}
        </button>
      </form>
      {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
