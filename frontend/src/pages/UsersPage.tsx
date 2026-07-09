import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import axiosInstance from '../api/axiosInstance';
import type { User, CreateUserRequest } from '../types';

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roles = user?.roles ?? [];
  const isAdminGlobal = roles.includes('AdminGlobal');

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get<User[]>('/users');
      setUsers(res.data);
    } catch {
      setError('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Usuários</h1>

      {isAdminGlobal && <CreateUserForm onCreated={fetchUsers} />}

      {loading && <p>Carregando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && users.length === 0 && <p>Nenhum usuário encontrado.</p>}

      {!loading && !error && users.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Nome</th>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Perfis</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{u.name}</td>
                <td style={{ padding: 8 }}>{u.email}</td>
                <td style={{ padding: 8 }}>
                  {u.roles && u.roles.length > 0
                    ? u.roles.map((r) => r.role).join(', ')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: CreateUserRequest = { email, name, password };

    try {
      await axiosInstance.post('/users', payload);
      setEmail('');
      setName('');
      setPassword('');
      onCreated();
    } catch {
      setError('Erro ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
      <h2>Criar Usuário</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label htmlFor="user-email" style={{ display: 'block', fontSize: 12 }}>Email</label>
          <input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="user-name" style={{ display: 'block', fontSize: 12 }}>Nome</label>
          <input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
          />
        </div>
        <div>
          <label htmlFor="user-password" style={{ display: 'block', fontSize: 12 }}>Senha</label>
          <input
            id="user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
            style={{ padding: 6 }}
            autoComplete="new-password"
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
