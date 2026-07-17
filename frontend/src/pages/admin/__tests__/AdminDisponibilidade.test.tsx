/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDisponibilidade } from '../AdminDisponibilidade';

// ── API mock ─────────────────────────────────────────────────────────────

vi.mock('../../../api/availabilityApi', () => ({
  availabilityApi: {
    getAll: vi.fn(),
    createRestriction: vi.fn(),
    deleteRestriction: vi.fn(),
  },
}));

import { availabilityApi } from '../../../api/availabilityApi';
import type { ProfessionalAvailability } from '../../../api/availabilityApi';

// ── Fixtures ─────────────────────────────────────────────────────────────

const today = new Date();
const iso = (offset: number): string => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const medicoDisponivel: ProfessionalAvailability = {
  userId: 'u-1',
  userName: 'Dr. Carlos Souza',
  registrationNumber: 'CRM 12345',
  professionalType: 'Medico',
  isActive: true,
  status: 'Disponivel',
  statusLabel: 'Disponível',
  restrictions: [],
};

const medicoFerias: ProfessionalAvailability = {
  userId: 'u-2',
  userName: 'Dra. Camila Ferraz',
  registrationNumber: 'CRM 67890',
  professionalType: 'Medico',
  isActive: true,
  status: 'Ferias',
  statusLabel: 'Férias',
  restrictions: [
    {
      id: 'r-2',
      userId: 'u-2',
      userName: 'Dra. Camila Ferraz',
      type: 'Ferias',
      typeLabel: 'Férias',
      startDate: iso(-3),
      endDate: iso(10),
      createdAt: new Date().toISOString(),
    },
  ],
};

const medicoLicenca: ProfessionalAvailability = {
  userId: 'u-3',
  userName: 'Dr. Roberto Alves',
  registrationNumber: 'CRM 33333',
  professionalType: 'Medico',
  isActive: true,
  status: 'Licenca',
  statusLabel: 'Licença',
  restrictions: [
    {
      id: 'r-3',
      userId: 'u-3',
      userName: 'Dr. Roberto Alves',
      type: 'LicencaMedica',
      typeLabel: 'Licença médica',
      startDate: iso(-5),
      endDate: iso(20),
      notes: 'Atestado #123',
      createdAt: new Date().toISOString(),
    },
  ],
};

const medicoRestricao: ProfessionalAvailability = {
  userId: 'u-4',
  userName: 'Dra. Renata Silva',
  registrationNumber: 'CRM 44444',
  professionalType: 'Medico',
  isActive: true,
  status: 'Restricao',
  statusLabel: 'Com restrição',
  restrictions: [
    {
      id: 'r-4',
      userId: 'u-4',
      userName: 'Dra. Renata Silva',
      type: 'RestricaoTurno',
      typeLabel: 'Restrição de turno',
      startDate: iso(-30),
      endDate: iso(365),
      blockedShiftsMask: 0b100, // noite
      createdAt: new Date().toISOString(),
    },
  ],
};

const medicoAfastado: ProfessionalAvailability = {
  userId: 'u-5',
  userName: 'Dr. Pedro Lima',
  registrationNumber: 'CRM 55555',
  professionalType: 'Medico',
  isActive: true,
  status: 'Afastado',
  statusLabel: 'Afastado',
  restrictions: [
    {
      id: 'r-5',
      userId: 'u-5',
      userName: 'Dr. Pedro Lima',
      type: 'AfastamentoAdministrativo',
      typeLabel: 'Afastamento administrativo',
      startDate: iso(-2),
      endDate: iso(30),
      createdAt: new Date().toISOString(),
    },
  ],
};

const fullFixture = [medicoDisponivel, medicoFerias, medicoLicenca, medicoRestricao, medicoAfastado];

function renderPage(props: Partial<React.ComponentProps<typeof AdminDisponibilidade>> = {}) {
  return render(
    <div id="adm-root">
      <AdminDisponibilidade
        onBack={vi.fn()}
        dark={false}
        onToggleTheme={vi.fn()}
        onOpenSidebar={vi.fn()}
        {...props}
      />
    </div>,
  );
}

/** "Dr. Carlos" pode aparecer em múltiplos lugares — aguarda cards renderizados. */
async function waitForCards() {
  await waitFor(() => {
    const cards = document.querySelectorAll('.disp-med-card-name');
    expect(cards.length).toBeGreaterThan(0);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('<AdminDisponibilidade />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (availabilityApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(fullFixture);
  });

  it('exibe o título da página', async () => {
    renderPage();
    expect(screen.getByText('Disponibilidade dos Médicos')).toBeInTheDocument();
    expect(screen.getByText('Controle de Disponibilidade')).toBeInTheDocument();
    await waitForCards();
  });

  it('mostra estado de loading inicialmente e depois carrega os cards', async () => {
    renderPage();
    expect(screen.getByText(/Carregando disponibilidade/i)).toBeInTheDocument();
    await waitForCards();
    expect(screen.queryByText(/Carregando disponibilidade/i)).not.toBeInTheDocument();
  });

  it('renderiza um card por profissional', async () => {
    renderPage();
    await waitForCards();
    const cards = document.querySelectorAll('.disp-med-card');
    expect(cards.length).toBe(fullFixture.length);
  });

  it('exibe o badge correto para cada status', async () => {
    renderPage();
    await waitForCards();
    // Cada card tem um badge — checamos por statusLabel dentro do card do profissional.
    const disponivelCard = Array.from(document.querySelectorAll('.disp-med-card'))
      .find(c => c.querySelector('.disp-med-card-name')?.textContent === 'Dr. Carlos Souza');
    expect(disponivelCard?.querySelector('.disp-badge-disponivel')).toBeInTheDocument();

    const feriasCard = Array.from(document.querySelectorAll('.disp-med-card'))
      .find(c => c.querySelector('.disp-med-card-name')?.textContent === 'Dra. Camila Ferraz');
    expect(feriasCard?.querySelector('.disp-badge-ferias')).toBeInTheDocument();

    const licencaCard = Array.from(document.querySelectorAll('.disp-med-card'))
      .find(c => c.querySelector('.disp-med-card-name')?.textContent === 'Dr. Roberto Alves');
    expect(licencaCard?.querySelector('.disp-badge-licenca')).toBeInTheDocument();

    const restricaoCard = Array.from(document.querySelectorAll('.disp-med-card'))
      .find(c => c.querySelector('.disp-med-card-name')?.textContent === 'Dra. Renata Silva');
    expect(restricaoCard?.querySelector('.disp-badge-restricao')).toBeInTheDocument();

    const afastadoCard = Array.from(document.querySelectorAll('.disp-med-card'))
      .find(c => c.querySelector('.disp-med-card-name')?.textContent === 'Dr. Pedro Lima');
    expect(afastadoCard?.querySelector('.disp-badge-afastado')).toBeInTheDocument();
  });

  it('mostra as restrições ativas no card do médico', async () => {
    renderPage();
    await waitForCards();
    // Escopa aos itens de restrição dos cards (badges/opções do drawer têm o mesmo texto)
    const tipos = Array.from(document.querySelectorAll('.disp-restricao-tipo'))
      .map(e => e.textContent);
    expect(tipos).toContain('Férias');
    expect(tipos).toContain('Licença médica');
    expect(tipos).toContain('Restrição de turno');
    expect(tipos).toContain('Afastamento administrativo');
  });

  it('mostra "Sem restrições" para médicos sem restrições', async () => {
    renderPage();
    await waitForCards();
    expect(screen.getByText(/Sem restrições cadastradas/i)).toBeInTheDocument();
  });

  it('mostra empty state quando não há profissionais', async () => {
    (availabilityApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Nenhum profissional cadastrado/i)).toBeInTheDocument();
    });
  });

  it('lida graciosamente com erro na API', async () => {
    (availabilityApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => {
      // Após erro, sai do loading e cai no empty state
      expect(screen.queryByText(/Carregando disponibilidade/i)).not.toBeInTheDocument();
    });
  });

  it('abre o drawer ao clicar em "Registrar restrição"', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForCards();

    await user.click(screen.getByRole('button', { name: /Registrar restrição/i }));
    expect(screen.getByText('Registrar restrição de disponibilidade')).toBeInTheDocument();
  });

  it('mantém o botão salvar desabilitado até o formulário estar válido', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForCards();
    await user.click(screen.getByRole('button', { name: /Registrar restrição/i }));

    const btn = screen.getByRole('button', { name: /Salvar restrição/i });
    expect(btn).toBeDisabled();
  }, 15000);

  it('cria uma restrição de férias com sucesso', async () => {
    (availabilityApi.createRestriction as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'new-r',
      userId: 'u-1',
      type: 'Ferias',
      typeLabel: 'Férias',
      startDate: iso(30),
      endDate: iso(45),
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    renderPage();
    await waitForCards();
    await user.click(screen.getByRole('button', { name: /Registrar restrição/i }));

    // Escopa os selects ao drawer
    const drawer = document.querySelector('.disp-drawer-body') as HTMLElement;
    const selects = drawer.querySelectorAll('select');
    const professionalSelect = selects[0]; // Médico
    const typeSelect = selects[1]; // Tipo
    await user.selectOptions(professionalSelect, 'u-1');
    await user.selectOptions(typeSelect, 'Ferias');

    // Preenche datas (label pode variar entre versões — usamos type=date direto)
    const dateInputs = drawer.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0] as HTMLInputElement, iso(30));
    await user.type(dateInputs[1] as HTMLInputElement, iso(45));

    const btn = screen.getByRole('button', { name: /Salvar restrição/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await user.click(btn);

    await waitFor(() => {
      expect(availabilityApi.createRestriction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          type: 'Ferias',
        }),
      );
    });
  }, 15000);

  it('remove uma restrição ao clicar no botão de excluir', async () => {
    (availabilityApi.deleteRestriction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();
    await waitForCards();

    const delButtons = document.querySelectorAll('.disp-restricao-del');
    expect(delButtons.length).toBeGreaterThan(0);
    await user.click(delButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(availabilityApi.deleteRestriction).toHaveBeenCalledTimes(1);
    });
  });

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    renderPage({ onToggleTheme });
    await waitForCards();

    await user.click(screen.getByRole('button', { name: /Tema escuro|Tema claro/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('chama onOpenSidebar ao clicar no hamburger', async () => {
    const user = userEvent.setup();
    const onOpenSidebar = vi.fn();
    renderPage({ onOpenSidebar });
    await waitForCards();

    const hamburger = document.querySelector('.disp-hamburger') as HTMLButtonElement;
    expect(hamburger).toBeInTheDocument();
    await user.click(hamburger);
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('mostra seção de turnos ao selecionar tipo RestricaoTurno', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForCards();
    await user.click(screen.getByRole('button', { name: /Registrar restrição/i }));

    const drawer = document.querySelector('.disp-drawer-body') as HTMLElement;
    const typeSelect = drawer.querySelectorAll('select')[1];
    await user.selectOptions(typeSelect, 'RestricaoTurno');

    expect(screen.getByText('Turnos indisponíveis *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manhã/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tarde/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Noite/i })).toBeInTheDocument();
  }, 15000);

  it('mostra seção de dias da semana ao selecionar DiasEspecificos', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForCards();
    await user.click(screen.getByRole('button', { name: /Registrar restrição/i }));

    const drawer = document.querySelector('.disp-drawer-body') as HTMLElement;
    const typeSelect = drawer.querySelectorAll('select')[1];
    await user.selectOptions(typeSelect, 'DiasEspecificos');

    expect(screen.getByText('Dias da semana indisponíveis *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sáb/i })).toBeInTheDocument();
  }, 15000);
});
