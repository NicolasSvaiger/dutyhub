/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminMedicos } from '../AdminMedicos';

// Mock APIs
vi.mock('../../../api/usersApi', () => ({
  usersApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    assignRole: vi.fn(),
    toggleStatus: vi.fn(),
  },
}));

vi.mock('../../../api/clinicsApi', () => ({
  clinicsApi: {
    getAll: vi.fn(),
  },
}));

import { usersApi } from '../../../api/usersApi';
import { clinicsApi } from '../../../api/clinicsApi';

const mockUsers = [
  {
    id: 'u1',
    name: 'Dra. Jessica Lima',
    email: 'jessica@email.com',
    professionalType: 'Medico',
    isActive: true,
    cpf: '12345678901',
    phone: '11999999999',
    registrationNumber: 'CRM-5485-SP',
    specialty: 'Clínica Geral',
    employmentType: 'CLT',
    dateOfBirth: '1990-05-15',
    createdAt: '2024-01-01',
    roles: [{ id: 'r1', userId: 'u1', clinicId: 'c1', role: 'Medico', assignedAt: '2024-01-01' }],
  },
  {
    id: 'u2',
    name: 'Enf. Priscila Teles',
    email: 'priscila@email.com',
    professionalType: 'Enfermeiro',
    isActive: true,
    cpf: '98765432100',
    phone: '11888888888',
    registrationNumber: 'COREN-9901-SP',
    specialty: null,
    employmentType: 'PJ',
    dateOfBirth: '1985-03-20',
    createdAt: '2024-01-01',
    roles: [{ id: 'r2', userId: 'u2', clinicId: 'c1', role: 'Enfermeiro', assignedAt: '2024-01-01' }],
  },
  {
    id: 'u3',
    name: 'Admin Global',
    email: 'admin@email.com',
    professionalType: null,
    isActive: true,
    cpf: null,
    phone: null,
    registrationNumber: null,
    specialty: null,
    employmentType: null,
    dateOfBirth: null,
    createdAt: '2024-01-01',
    roles: [{ id: 'r3', userId: 'u3', clinicId: 'c1', role: 'AdminGlobal', assignedAt: '2024-01-01' }],
  },
  {
    id: 'u4',
    name: 'Dr. Carlos Nunes',
    email: 'carlos@email.com',
    professionalType: 'Medico',
    isActive: false,
    cpf: '11122233344',
    phone: '11777777777',
    registrationNumber: 'CRM-1102-SP',
    specialty: 'Pediatria',
    employmentType: 'CLT',
    dateOfBirth: '1978-11-10',
    createdAt: '2024-01-01',
    roles: [{ id: 'r4', userId: 'u4', clinicId: 'c1', role: 'Medico', assignedAt: '2024-01-01' }],
  },
];

const mockClinics = [
  { id: 'c1', name: 'UPA Centro', address: 'Rua A, 100', phone: '1111', isActive: true, createdAt: '2024-01-01' },
  { id: 'c2', name: 'UPA Norte', address: 'Rua B, 200', phone: '2222', isActive: true, createdAt: '2024-01-01' },
];

function renderMedicos() {
  return render(
    <MemoryRouter>
      <div id="adm-root">
        <AdminMedicos onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
      </div>
    </MemoryRouter>,
  );
}

describe('<AdminMedicos />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (usersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsers);
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
  });

  it('renderiza o título e subtítulo', async () => {
    renderMedicos();
    expect(screen.getByText('Médicos e Enfermeiros')).toBeInTheDocument();
    expect(screen.getByText('Equipe Médica')).toBeInTheDocument();
  });

  it('carrega e exibe KPIs corretamente', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument(); // Total (excl admin)
    });
  });

  it('filtra admins — não mostra Admin Global na tabela', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    });
    expect(screen.queryByText('Admin Global')).not.toBeInTheDocument();
  });

  it('mostra médicos e enfermeiros na tabela', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
      expect(screen.getByText('Enf. Priscila Teles')).toBeInTheDocument();
    });
  });

  it('exibe badge de tipo correto', async () => {
    renderMedicos();
    await waitFor(() => {
      const medBadges = screen.getAllByText('Médico');
      expect(medBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Enfermeiro')).toBeInTheDocument();
    });
  });

  it('exibe registro CRM/COREN', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('CRM-5485-SP')).toBeInTheDocument();
      expect(screen.getByText('COREN-9901-SP')).toBeInTheDocument();
    });
  });

  it('exibe status Ativo/Inativo corretamente', async () => {
    renderMedicos();
    await waitFor(() => {
      const ativos = screen.getAllByText('Ativo');
      const inativos = screen.getAllByText('Inativo');
      expect(ativos.length).toBeGreaterThanOrEqual(1);
      expect(inativos.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('enfermeiro mostra "—" na especialidade', async () => {
    renderMedicos();
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('mostra UPAs autorizadas como chips', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getAllByText('UPA Centro').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('abre drawer ao clicar em "Novo profissional"', async () => {
    renderMedicos();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    });
    const btns = screen.getAllByRole('button').filter(b => b.textContent?.includes('Novo profissional'));
    await user.click(btns[0]);
    // Drawer step labels should appear
    await waitFor(() => {
      // The step labels are always rendered but the drawer becomes visible
      const labels = screen.getAllByText('Dados pessoais');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('botão "Próximo" desabilitado quando campos obrigatórios estão vazios', async () => {
    renderMedicos();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    });
    const btn = screen.getAllByText('Novo profissional').find(el => el.tagName === 'BUTTON') || screen.getAllByText('Novo profissional')[0];
    await user.click(btn);
    const nextBtn = screen.getByText('Próximo →');
    expect(nextBtn).toBeDisabled();
  });

  it('filtro por tipo funciona', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    });
    // Click "Médicos e enfermeiros" dropdown e selecionar "Somente enfermeiros"
    const tipoBtn = screen.getByText('Médicos e enfermeiros');
    const user = userEvent.setup();
    await user.click(tipoBtn);
    await user.click(screen.getByText('Somente enfermeiros'));
    // Should show only enfermeiro
    expect(screen.getByText('Enf. Priscila Teles')).toBeInTheDocument();
    expect(screen.queryByText('Dra. Jessica Lima')).not.toBeInTheDocument();
  });

  it('busca por nome funciona', async () => {
    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const searchInput = screen.getByPlaceholderText('Buscar por nome, CRM ou COREN...');
    await user.type(searchInput, 'Jessica');
    expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    expect(screen.queryByText('Enf. Priscila Teles')).not.toBeInTheDocument();
  });

  it('paginação exibe máximo 5 por página', async () => {
    // Add more users to test pagination
    const manyUsers = Array.from({ length: 8 }, (_, i) => ({
      id: `mu${i}`,
      name: `Dr. Teste ${i}`,
      email: `teste${i}@email.com`,
      professionalType: 'Medico',
      isActive: true,
      cpf: null,
      phone: null,
      registrationNumber: `CRM-${i}-SP`,
      specialty: 'Geral',
      employmentType: null,
      dateOfBirth: null,
      createdAt: '2024-01-01',
      roles: [{ id: `rm${i}`, userId: `mu${i}`, clinicId: 'c1', role: 'Medico', assignedAt: '2024-01-01' }],
    }));
    (usersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(manyUsers);

    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('Dr. Teste 0')).toBeInTheDocument();
    });
    // Should show only first 5
    expect(screen.getByText('Dr. Teste 4')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Teste 5')).not.toBeInTheDocument();
    // Pagination info
    expect(screen.getByText(/Exibindo 1–5 de 8/)).toBeInTheDocument();
  });

  it('toggle status chama API', async () => {
    (usersApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockUsers[0], isActive: false });
    (usersApi.getAll as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockUsers)
      .mockResolvedValueOnce(mockUsers.map(u => u.id === 'u1' ? { ...u, isActive: false } : u));

    renderMedicos();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    });

    // Find and click the inactivate button (first danger button)
    const inactivateBtns = screen.getAllByTitle('Inativar');
    const user = userEvent.setup();
    await user.click(inactivateBtns[0]);

    await waitFor(() => {
      expect(usersApi.toggleStatus).toHaveBeenCalledWith('u1');
    });
  });

  // ── Novos testes (mudanças da Sprint 6) ──────────────────────────────────

  // Helper: abre drawer e preenche step 1 usando seletores escopados no drawer
  async function openDrawerAndFillStep1(user: ReturnType<typeof userEvent.setup>, name: string, email: string) {
    const novoBtn = document.querySelector('.med-btn-novo') as HTMLElement;
    await user.click(novoBtn);
    await waitFor(() => {
      expect(document.querySelector('.med-drawer.open')).not.toBeNull();
    });
    const drawer = document.querySelector('.med-drawer') as HTMLElement;

    await user.type(drawer.querySelector('input[placeholder="Ex: Dra. Jessica Lima"]') as HTMLElement, name);
    await user.type(drawer.querySelector('input[placeholder="profissional@email.com"]') as HTMLElement, email);

    // Tipo — primeiro CustomSelect dentro do drawer (não o filtro da tabela)
    const tipoBtn = drawer.querySelector('.med-cselect-btn') as HTMLElement;
    await user.click(tipoBtn);
    await waitFor(() => expect(drawer.querySelector('.med-cselect-option:nth-child(2)')).not.toBeNull());
    await user.click(drawer.querySelector('.med-cselect-option:nth-child(2)') as HTMLElement);

    await user.type(drawer.querySelector('input[placeholder="Ex: 5485-SP"]') as HTMLElement, 'CRM-1-SP');
    await user.type(drawer.querySelector('input[placeholder="Ex: Clínica Geral"]') as HTMLElement, 'Geral');
    await user.type(drawer.querySelector('input[placeholder="000.000.000-00"]') as HTMLElement, '123.456.789-00');
    await user.type(drawer.querySelector('input[placeholder="(11) 99999-9999"]') as HTMLElement, '(11) 98888-7777');

    return drawer;
  }

  it('cria profissional chamando usersApi.create', async () => {
    const createdUser = { ...mockUsers[0], id: 'u-new' };
    (usersApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(createdUser);
    (usersApi.assignRole as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (usersApi.getAll as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockUsers)
      .mockResolvedValueOnce([...mockUsers, createdUser]);

    renderMedicos();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThanOrEqual(1));

    const drawer = await openDrawerAndFillStep1(user, 'Dr. Teste Novo', 'novo@email.com');

    await waitFor(() => {
      const nextBtn = drawer.querySelector('.med-btn-next') as HTMLButtonElement;
      expect(nextBtn?.disabled).toBe(false);
    }, { timeout: 5000 });

    const nextBtn = drawer.querySelector('.med-btn-next') as HTMLElement;
    await user.click(nextBtn); // → step 2
    // Re-query after state update (new step rendered)
    await waitFor(() => expect(drawer.querySelector('.med-btn-next')).not.toBeNull());
    await user.click(drawer.querySelector('.med-btn-next') as HTMLElement); // → step 3
    await user.click(drawer.querySelector('.med-btn-salvar') as HTMLElement);

    await waitFor(() => {
      expect(usersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dr. Teste Novo', email: 'novo@email.com' }),
      );
    }, { timeout: 8000 });
  }, 20000);

  it('drawer step 2 exibe lista de UPAs', async () => {
    renderMedicos();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThanOrEqual(1));

    const drawer = await openDrawerAndFillStep1(user, 'Dr. X', 'x@x.com');

    await waitFor(() => {
      const nextBtn = drawer.querySelector('.med-btn-next') as HTMLButtonElement;
      expect(nextBtn?.disabled).toBe(false);
    }, { timeout: 5000 });

    await user.click(drawer.querySelector('.med-btn-next') as HTMLElement);

    await waitFor(() => {
      // Use drawer-scoped query to avoid matching the table <th>
      const sectionTitle = drawer.querySelector('.med-form-section-title');
      expect(sectionTitle?.textContent).toContain('UPAs autorizadas');
    }, { timeout: 3000 });
    expect(screen.getAllByText('UPA Centro').length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('lida graciosamente quando a API retorna erro', async () => {
    (usersApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Offline'));
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Offline'));
    renderMedicos();
    await waitFor(() => {
      // Should render without crash — shows 0 professionals
      expect(screen.getByText('Profissionais cadastrados')).toBeInTheDocument();
    });
  });
});
