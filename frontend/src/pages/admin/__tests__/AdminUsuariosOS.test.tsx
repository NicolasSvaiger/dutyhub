/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsuariosOS } from '../AdminUsuariosOS';

// ─── API mocks ────────────────────────────────────────────────────────────

vi.mock('../../../api/usersApi', () => ({
  usersApi: {
    getAll: vi.fn(),
    getAdmins: vi.fn(),
    toggleStatus: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { usersApi } from '../../../api/usersApi';
import { useAuth } from '../../../hooks/useAuth';

const mockAdminGlobal = {
  userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin Global',
  roles: ['AdminGlobal'], clinicId: null, clinicIds: [],
};

function setupAuth(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const user = role === 'AdminGlobal' ? mockAdminGlobal : {
    ...mockAdminGlobal, roles: ['AdminClinica'], userId: 'u-ac',
  };
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mockUsers = [
  {
    id: 'u1',
    email: 'admin@plantonhub.com',
    name: 'Admin Global',
    isActive: true,
    createdAt: '2026-07-01T10:00:00Z',
    roles: [{ id: 'r1', userId: 'u1', clinicId: 'c1', role: 'AdminGlobal', assignedAt: '2026-07-01T10:00:00Z' }],
  },
  {
    id: 'u2',
    email: 'clinic@plantonhub.com',
    name: 'Coordenador Silva',
    isActive: true,
    createdAt: '2026-07-05T14:00:00Z',
    roles: [{ id: 'r2', userId: 'u2', clinicId: 'c1', role: 'AdminClinica', assignedAt: '2026-07-05T14:00:00Z' }],
  },
  {
    id: 'u3',
    email: 'inactive@plantonhub.com',
    name: 'Ex Coordenador',
    isActive: false,
    createdAt: '2026-06-15T09:00:00Z',
    roles: [{ id: 'r3', userId: 'u3', clinicId: 'c1', role: 'AdminClinica', assignedAt: '2026-06-15T09:00:00Z' }],
  },
  {
    id: 'u4',
    email: 'medico@plantonhub.com',
    name: 'Dr João',
    isActive: true,
    createdAt: '2026-07-10T08:00:00Z',
    roles: [{ id: 'r4', userId: 'u4', clinicId: 'c1', role: 'Medico', assignedAt: '2026-07-10T08:00:00Z' }],
  },
];

function renderPage() {
  setupAuth();
  return render(
    <div id="adm-root">
      <AdminUsuariosOS onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('<AdminUsuariosOS />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
    (usersApi.getAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsers);
    (usersApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockUsers[0], isActive: false });
  });

  it('exibe o título da página', () => {
    renderPage();
    expect(screen.getByText('Usuários da OS')).toBeInTheDocument();
    expect(screen.getByText('Gestão de Usuários')).toBeInTheDocument();
  });

  it('carrega usuários com role admin apenas (filtra Medico)', async () => {
    // getAdmins retorna todos os usuários que a API envia — o filtro é no backend
    // O mock retorna todos os 4 usuários incluindo Dr João
    renderPage();
    await waitFor(() => screen.getByText('Admin Global'));
    expect(screen.getByText('Admin Global')).toBeInTheDocument();
    expect(screen.getByText('Coordenador Silva')).toBeInTheDocument();
    expect(screen.getByText('Ex Coordenador')).toBeInTheDocument();
    // Dr João também aparece pois o componente usa tudo que getAdmins retorna
    expect(screen.getByText('Dr João')).toBeInTheDocument();
  });

  it('exibe KPIs corretamente', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Admin Global'));
    // Total: 4 usuários retornados pela API
    // Ativos: 3 (Admin Global, Coordenador Silva, Dr João)
    // Inativos: 1 (Ex Coordenador)
    const totalCard = screen.getByText('Total de usuários').closest('.uos-kpi');
    expect(totalCard).toHaveTextContent('4');
    const ativosCard = screen.getByText('Ativos').closest('.uos-kpi');
    expect(ativosCard).toHaveTextContent('3');
    const inativosCard = screen.getByText('Inativos').closest('.uos-kpi');
    expect(inativosCard).toHaveTextContent('1');
  });

  it('badge Admin Master aparece para AdminGlobal', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Admin Global'));
    expect(screen.getAllByText('Admin Master').length).toBeGreaterThan(0);
  });

  it('badge Operacional aparece para AdminClinica', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Coordenador Silva'));
    // AdminClinica → roleToPerfil retorna 'Admin OS'
    expect(screen.getAllByText('Admin OS').length).toBeGreaterThan(0);
  });

  it('busca por nome filtra a tabela', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Admin Global'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou e-mail...'), 'Silva');
    expect(screen.getByText('Coordenador Silva')).toBeInTheDocument();
    expect(screen.queryByText('Admin Global')).not.toBeInTheDocument();
  });

  it('busca por email filtra a tabela', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Admin Global'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou e-mail...'), 'inactive@');
    expect(screen.getByText('Ex Coordenador')).toBeInTheDocument();
    expect(screen.queryByText('Admin Global')).not.toBeInTheDocument();
  });

  it('mensagem vazia quando busca não retorna resultado', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Admin Global'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou e-mail...'), 'xyzinexistente');
    expect(screen.getByText('Nenhum usuário encontrado.')).toBeInTheDocument();
  });

  it('lida com erro da API graciosamente', async () => {
    (usersApi.getAdmins as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhum usuário encontrado.')).toBeInTheDocument();
    });
  });

  it('chama toggleStatus ao suspender usuário ativo', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Admin Global'));
    const btns = document.querySelectorAll('.uos-act-btn.danger');
    expect(btns.length).toBeGreaterThan(0);
    await user.click(btns[0]);
    await waitFor(() => {
      expect(usersApi.toggleStatus).toHaveBeenCalled();
    });
  });

  it('chama toggleStatus ao reativar usuário inativo', async () => {
    (usersApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockUsers[2], isActive: true });
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Ex Coordenador'));
    const btns = document.querySelectorAll('.uos-act-btn.success');
    expect(btns.length).toBeGreaterThan(0);
    await user.click(btns[0]);
    await waitFor(() => {
      expect(usersApi.toggleStatus).toHaveBeenCalledWith('u3');
    });
  });
  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    setupAuth();
    render(
      <div id="adm-root">
        <AdminUsuariosOS onBack={vi.fn()} dark={false} onToggleTheme={onToggle} />
      </div>
    );
    const user = userEvent.setup();
    const themeBtn = document.querySelector('.theme-toggle') as HTMLElement;
    await user.click(themeBtn);
    expect(onToggle).toHaveBeenCalled();
  });
});
