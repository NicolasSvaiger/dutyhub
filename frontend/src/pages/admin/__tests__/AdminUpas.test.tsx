/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUpas } from '../AdminUpas';

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock('../../../api/clinicsApi', () => ({
  clinicsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toggleStatus: vi.fn(),
    upsertShiftTemplates: vi.fn(),
  },
}));

import { clinicsApi } from '../../../api/clinicsApi';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockClinics = [
  {
    id: 'c1',
    name: 'UPA Vila Pereira',
    address: 'Rua das Flores, 210',
    phone: '11999990001',
    isActive: true,
    hasNursing: false,
    createdAt: '2026-07-12T00:00:00Z',
    latitude: -23.55,
    longitude: -46.63,
    allowedRadiusMeters: 150,
    capacity: 50,
    doctorsPerShift: 4,
    city: 'São Paulo',
    neighborhood: 'Vila Pereira',
    zipCode: '01310100',
    shiftTemplates: [
      { id: 'st1', name: 'Manhã', startTime: '07:00:00', endTime: '19:00:00', requiredStaff: 4, displayOrder: 1, professionalType: 'Medico' },
      { id: 'st2', name: 'Noite', startTime: '19:00:00', endTime: '07:00:00', requiredStaff: 4, displayOrder: 2, professionalType: 'Medico' },
    ],
  },
  {
    id: 'c2',
    name: 'UPA Centro',
    address: 'Av. Paulista, 1500',
    phone: '11999990002',
    isActive: false,
    hasNursing: true,
    createdAt: '2026-07-12T00:00:00Z',
    latitude: null,
    longitude: null,
    allowedRadiusMeters: null,
    capacity: 60,
    doctorsPerShift: 4,
    city: 'São Paulo',
    neighborhood: 'Bela Vista',
    zipCode: '01310200',
    shiftTemplates: [],
  },
];

// ─── Render helper ────────────────────────────────────────────────────────────

function renderUpas(props?: Partial<{ dark: boolean }>) {
  return render(
    <div id="adm-root">
      <AdminUpas onBack={vi.fn()} dark={props?.dark ?? false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('<AdminUpas />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
    (clinicsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0], id: 'c-new' });
    (clinicsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics[0]);
    (clinicsApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0], isActive: false });
    (clinicsApi.upsertShiftTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics[0]);
  });

  // ── Renderização ─────────────────────────────────────────────────────────────

  it('exibe o título da página', async () => {
    renderUpas();
    expect(screen.getByText('Unidades de Pronto Atendimento (UPAs)')).toBeInTheDocument();
    expect(screen.getByText('Gestão de UPAs')).toBeInTheDocument();
  });

  it('exibe KPIs após carregar', async () => {
    renderUpas();
    await waitFor(() => {
      // Total = 2, Ativas = 1, Com geo = 1, Meta méd. = 8 (4+4)
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('exibe os cards das UPAs', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('UPA Vila Pereira')).toBeInTheDocument();
      expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    });
  });

  it('badge "Ativa" e "Inativa" aparecem corretamente', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('Ativa')).toBeInTheDocument();
      expect(screen.getByText('Inativa')).toBeInTheDocument();
    });
  });

  it('exibe "Geolocalização configurada" para UPA com coords', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('Geolocalização configurada')).toBeInTheDocument();
    });
  });

  it('exibe "Geolocalização pendente" para UPA sem coords', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('Geolocalização pendente')).toBeInTheDocument();
    });
  });

  it('exibe chips de turnos da UPA', async () => {
    renderUpas();
    await waitFor(() => {
      // Turno chips come from shiftTemplates
      const manhas = screen.getAllByText(/Manhã/);
      expect(manhas.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('exibe capacidade e meta de médicos nos cards', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('50 leitos')).toBeInTheDocument();
      expect(screen.getAllByText('4 méd.').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('lida com erro da API graciosamente', async () => {
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma UPA cadastrada/)).toBeInTheDocument();
    });
  });

  // ── Filtros ──────────────────────────────────────────────────────────────────

  it('busca por nome filtra os cards', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou endereço...'), 'Centro');
    expect(screen.queryByText('UPA Vila Pereira')).not.toBeInTheDocument();
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
  });

  it('busca por endereço filtra os cards', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou endereço...'), 'Paulista');
    expect(screen.queryByText('UPA Vila Pereira')).not.toBeInTheDocument();
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
  });

  it('filtro "Ativa" exibe apenas UPAs ativas', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByText('Todos os status'));
    // Use getAllByText and click the option (inside the dropdown, not the badge)
    const ativaOptions = screen.getAllByText('Ativa');
    const ativaOption = ativaOptions.find(el => el.classList.contains('upa-cselect-option'));
    await user.click(ativaOption!);
    expect(screen.getByText('UPA Vila Pereira')).toBeInTheDocument();
    expect(screen.queryByText('UPA Centro')).not.toBeInTheDocument();
  });

  it('filtro "Inativa" exibe apenas UPAs inativas', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Centro'));
    await user.click(screen.getByText('Todos os status'));
    const inativaOptions = screen.getAllByText('Inativa');
    const inativaOption = inativaOptions.find(el => el.classList.contains('upa-cselect-option'));
    await user.click(inativaOption!);
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    expect(screen.queryByText('UPA Vila Pereira')).not.toBeInTheDocument();
  });

  it('mensagem vazia quando nenhum resultado no filtro', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou endereço...'), 'xyzinexistente');
    expect(screen.getByText('Nenhuma UPA encontrada.')).toBeInTheDocument();
  });

  // ── Drawer — abrir/fechar ─────────────────────────────────────────────────

  it('abre o drawer ao clicar em "Nova UPA"', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByText('Nome da unidade *')).toBeInTheDocument();
  });

  it('drawer mostra título "Nova UPA" ao criar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    const drawerTitle = document.querySelector('.upa-drawer-title');
    expect(drawerTitle?.textContent).toBe('Nova UPA');
  });

  it('drawer mostra título "Editar UPA" ao editar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const editBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(editBtns[0] as HTMLElement);
    await waitFor(() => {
      const drawerTitle = document.querySelector('.upa-drawer-title');
      expect(drawerTitle?.textContent).toBe('Editar UPA');
    });
  });

  it('fecha o drawer ao clicar em Cancelar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.click(screen.getByText('Cancelar'));
    await waitFor(() => {
      const drawer = document.querySelector('.upa-drawer');
      expect(drawer).not.toHaveClass('open');
    });
  });

  // ── Drawer — formulário ───────────────────────────────────────────────────

  it('botão salvar desabilitado quando nome está vazio', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    const saveBtn = screen.getByText('Salvar UPA');
    expect(saveBtn).toBeDisabled();
  });

  it('botão salvar habilitado quando nome preenchido', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'Nova UPA Teste');
    expect(screen.getByText('Salvar UPA')).not.toBeDisabled();
  });

  it('drawer pré-preenche campos ao editar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const editBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(editBtns[0] as HTMLElement);
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('Ex: UPA – Vila Pereira') as HTMLInputElement;
      expect(nameInput.value).toBe('UPA Vila Pereira');
    });
  });

  it('drawer mostra botão "Atualizar UPA" ao editar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const editBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(editBtns[0] as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText('Atualizar UPA')).toBeInTheDocument();
    });
  });

  it('drawer exibe seção de endereço com CEP', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByPlaceholderText('00000-000')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Rua das Flores, 210')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Bairro')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('São Paulo')).toBeInTheDocument();
  });

  it('drawer exibe seção de geolocalização', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByText('Obter coordenadas pelo endereço')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('-23.5505')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('-46.6333')).toBeInTheDocument();
  });

  it('drawer exibe seção de turnos', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByText('Turnos ativos')).toBeInTheDocument();
  });

  it('turnos Manhã e Noite habilitados por padrão', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    // Tarde deve aparecer como Desativado
    expect(screen.getByText('Desativado')).toBeInTheDocument();
  });

  it('toggle de enfermagem mostra/oculta seção Enfermagem', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    // Enfermagem section should not be visible initially
    expect(screen.queryByText('Enfermagem')).not.toBeInTheDocument();
    // Toggle the nursing switch
    const toggles = document.querySelectorAll('.upa-toggle-wrap input');
    const nursingToggle = toggles[toggles.length - 1] as HTMLInputElement;
    await user.click(nursingToggle);
    await waitFor(() => {
      expect(screen.getByText('Enfermagem')).toBeInTheDocument();
    });
  });

  // ── Salvar nova UPA ──────────────────────────────────────────────────────

  it('chama clinicsApi.create ao salvar nova UPA', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA Teste Nova');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => {
      expect(clinicsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'UPA Teste Nova' }),
      );
    });
  });

  it('chama upsertShiftTemplates após criar UPA', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA Teste Nova');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => {
      expect(clinicsApi.upsertShiftTemplates).toHaveBeenCalled();
    });
  });

  it('chama clinicsApi.update ao salvar edição', async () => {
    (clinicsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0] });
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const editBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(editBtns[0] as HTMLElement);
    await waitFor(() => screen.getByText('Atualizar UPA'));
    await user.click(screen.getByText('Atualizar UPA'));
    await waitFor(() => {
      expect(clinicsApi.update).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ name: 'UPA Vila Pereira' }),
      );
    });
  });

  it('exibe toast de sucesso após criar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA X');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => {
      expect(screen.getByText('UPA cadastrada com sucesso!')).toBeInTheDocument();
    });
  });

  it('exibe toast de erro quando API falha ao criar', async () => {
    (clinicsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({ response: { data: { detail: 'Já existe uma UPA com este nome.' } } });
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA Duplicada');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => {
      expect(screen.getByText('Já existe uma UPA com este nome.')).toBeInTheDocument();
    });
  });

  // ── Toggle Status ─────────────────────────────────────────────────────────

  it('chama toggleStatus e atualiza badge localmente', async () => {
    (clinicsApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0], isActive: false });
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    // Click the status toggle button for first card (second act-btn = toggle)
    const actBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(actBtns[1] as HTMLElement); // second button = danger/activate
    await waitFor(() => {
      expect(clinicsApi.toggleStatus).toHaveBeenCalledWith('c1');
    });
  });

  it('toast confirma desativação', async () => {
    (clinicsApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0], isActive: false });
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const actBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(actBtns[1] as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText(/desativada/)).toBeInTheDocument();
    });
  });

  // ── Theme toggle ──────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    render(
      <div id="adm-root">
        <AdminUpas onBack={vi.fn()} dark={false} onToggleTheme={onToggle} />
      </div>,
    );
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Gestão de UPAs'));
    const themeBtn = document.querySelector('.theme-toggle') as HTMLElement;
    await user.click(themeBtn);
    expect(onToggle).toHaveBeenCalled();
  });
});
