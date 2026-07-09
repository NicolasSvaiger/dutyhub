import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import axiosInstance from '../api/axiosInstance';
import type { Clinic, CreateClinicRequest } from '../types';

export function ClinicsPage() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roles = user?.roles ?? [];
  const isAdminGlobal = roles.includes('AdminGlobal');

  const fetchClinics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get<Clinic[]>('/clinics');
      setClinics(res.data);
    } catch {
      setError('Erro ao carregar clínicas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchClinics();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Clínicas</h1>

      {isAdminGlobal && <CreateClinicForm onCreated={fetchClinics} />}

      {loading && <p>Carregando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && clinics.length === 0 && <p>Nenhuma clínica encontrada.</p>}

      {!loading && !error && clinics.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Nome</th>
              <th style={{ padding: 8 }}>Endereço</th>
              <th style={{ padding: 8 }}>Telefone</th>
              <th style={{ padding: 8 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((clinic) => (
              <tr key={clinic.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{clinic.name}</td>
                <td style={{ padding: 8 }}>{clinic.address}</td>
                <td style={{ padding: 8 }}>{clinic.phone}</td>
                <td style={{ padding: 8 }}>{clinic.isActive ? 'Ativa' : 'Inativa'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateClinicForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: CreateClinicRequest = { name, address, phone };

    try {
      await axiosInstance.post('/clinics', payload);
      setName('');
      setAddress('');
      setPhone('');
      onCreated();
    } catch {
      setError('Erro ao criar clínica.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
      <h2>Criar Clínica</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label htmlFor="clinic-name" style={{ display: 'block', fontSize: 12 }}>Nome</label>
          <input
            id="clinic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="clinic-address" style={{ display: 'block', fontSize: 12 }}>Endereço</label>
          <input
            id="clinic-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="clinic-phone" style={{ display: 'block', fontSize: 12 }}>Telefone</label>
          <input
            id="clinic-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
