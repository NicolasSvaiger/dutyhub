/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraKpis } from '../PrefeituraKpis';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getKpis: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockKpis = {
  from: '2026-06-17',
  to: '2026-07-17',
  globalComplianceRate: 88.4,
  totalExpectedShifts: 200,
  totalCoveredShifts: 177,
  totalAbsences: 12,
  totalLateEvents: 18,
  averageLateMinutes: 14.5,
  substitutionRate: 6.5,
  totalActiveDoctors: 9,
  totalActiveMedicos: 7,
  totalActiveEnfermeiros: 2,
  byClinic: [
    { clinicId: 'c1', clinicName: 'UPA Centro', complianceRate: 95.2, expectedShifts: 60, coveredShifts: 57, absences: 2, lateEvents: 4 },
    { clinicId: 'c2', clinicName: 'UPA Norte', complianceRate: 82.1, expectedShifts: 70, coveredShifts: 58, absences: 6, lateEvents: 8 },
    { clinicId: 'c3', clinicName: 'UPA Sul', complianceRate: 65.0, expectedShifts: 70, coveredShifts: 45, absences: 4, lateEvents: 6 },
  ],
  topAbsenceDoctors: [
    { userId: 'u1', userName: 'Enf. Renata Silva', registrationNumber: null, professionalType: 'Enfermeiro', clinicId: 'c1', clinicName: 'UPA Centro', absences: 7, complianceRate: 60 },
  ],
  perfectAttendanceDoctors: [
    { userId: 'u2', userName: 'Dra. Jessica Lima', registrationNumber: null, professionalType: 'Medico', clinicId: 'c2', clinicName: 'UPA Norte', absences: 0, complianceRate: 100 },
  ],
};

describe('<PrefeituraKpis />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockResolvedValue(mockKpis);
  });

  // ── Fetch inicial ──────────────────────────────────────────────────

  it('chama getKpis() 5 vezes no mount (períodos consecutivos pra evolução+trend)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(prefeituraApi.getKpis).toHaveBeenCalledTimes(5);
    });
    const args = (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mock.calls[0];
    // ISO date shape yyyy-MM-dd
    expect(args[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // ── Hero ───────────────────────────────────────────────────────────

  it('renderiza card hero com % de cumprimento global (88.4%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByText(/Cumprimento global/i)).toBeInTheDocument());
    // O mini-gráfico de evolução também exibe "88.4%" em <text> SVG (mock
    // repete o mesmo valor pros 5 períodos) — escopar a busca ao hero card.
    const heroCards = screen.getAllByText('88.4%').filter((el) => el.tagName === 'DIV');
    expect(heroCards.length).toBeGreaterThan(0);
  });

  it('mostra período no rodapé do hero com formato pt-BR (dd/mm/yyyy → dd/mm/yyyy)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/\d{2}\/\d{2}\/\d{4}.*→.*\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
    });
  });

  it('renderiza os 4 cards do hero (cumprimento, ausências, atrasos, profissionais ativos)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Cumprimento global/i)).toBeInTheDocument();
    });
    expect(screen.getByText('12')).toBeInTheDocument(); // absences
    expect(screen.getByText('18')).toBeInTheDocument(); // late events
    expect(screen.getByText('9')).toBeInTheDocument(); // active doctors
  });

  // ── Filtros ───────────────────────────────────────────────────────

  it('renderiza inputs de "De" e "Até" com type=date', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(prefeituraApi.getKpis).toHaveBeenCalled());

    const from = document.getElementById('kpis-from') as HTMLInputElement;
    const to = document.getElementById('kpis-to') as HTMLInputElement;
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    expect(from.type).toBe('date');
    expect(to.type).toBe('date');
  });

  it('mudar filtro e clicar em "Aplicar" dispara nova bateria de fetches', async () => {
    render(<PrefeituraKpis />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getKpis).toHaveBeenCalledTimes(5));

    const from = document.getElementById('kpis-from') as HTMLInputElement;
    const to = document.getElementById('kpis-to') as HTMLInputElement;

    await user.clear(from);
    await user.type(from, '2026-01-01');
    await user.clear(to);
    await user.type(to, '2026-06-30');

    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => {
      expect(prefeituraApi.getKpis).toHaveBeenCalledTimes(10);
    });
    // O último dos 5 novos calls (índice 9) deve terminar em 2026-06-30.
    const lastArgs = (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mock.calls[9];
    expect(lastArgs[1]).toBe('2026-06-30');
  });

  it('botão Aplicar fica disabled durante loading', async () => {
    let resolveFn: ((v: typeof mockKpis) => void) | null = null;
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<typeof mockKpis>((resolve) => {
        resolveFn = resolve;
      }),
    );
    render(<PrefeituraKpis />);
    const btn = screen.getByRole('button', { name: /Carregando/i });
    expect(btn).toBeDisabled();

    resolveFn?.(mockKpis);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Aplicar/i })).not.toBeDisabled();
    });
  });

  // ── Ranking por UPA e médicos ──────────────────────────────────────

  it('renderiza ranking por UPA com as 3 clínicas ordenadas por compliance', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Desempenho por UPA/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText('UPA Centro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPA Norte').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPA Sul').length).toBeGreaterThan(0);
  });

  it('renderiza card "Maiores ausências" com Enf. Renata Silva', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Maiores ausências/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Enf. Renata Silva')).toBeInTheDocument();
    expect(screen.getByText(/7 faltas/i)).toBeInTheDocument();
  });

  it('renderiza badge de tipo profissional nos rankings + breakdown médicos/enfermeiros no card de ativos', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Maiores ausências/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Enfermeiro(a)')).toBeInTheDocument();
    expect(screen.getByText('Médico')).toBeInTheDocument();
    expect(screen.getByText(/Médicos: 7/)).toBeInTheDocument();
    expect(screen.getByText(/Enfermeiros\(as\): 2/)).toBeInTheDocument();
  });

  it('renderiza card "Melhor frequência" com Dra. Jessica Lima', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Melhor frequência/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('empty state dos rankings de médicos quando listas vêm vazias', async () => {
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockKpis,
      topAbsenceDoctors: [],
      perfectAttendanceDoctors: [],
    });
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma ausência registrada no período/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Nenhum profissional com 100% de presença/i)).toBeInTheDocument();
  });

  // ── Tabela por UPA ─────────────────────────────────────────────────

  it('renderiza tabela com todas as clínicas', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    expect(screen.getAllByText('UPA Centro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPA Norte').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPA Sul').length).toBeGreaterThan(0);
  });

  it('colunas da tabela: UPA, Cumprimento, Previsto, Coberto, Ausências, Atrasos', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('UPA');
    expect(headers).toContain('Cumprimento');
    expect(headers).toContain('Previsto');
    expect(headers).toContain('Coberto');
    expect(headers).toContain('Ausências');
    expect(headers).toContain('Atrasos');
  });

  it('aplica classe verde pra compliance >= 90 (UPA Centro 95.2%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const table = screen.getByRole('table');
    const cell = within(table).getByText('95.2%');
    expect(cell.className).toMatch(/Good/i);
  });

  it('aplica classe laranja pra compliance entre 70 e 89 (UPA Norte 82.1%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const table = screen.getByRole('table');
    const cell = within(table).getByText('82.1%');
    expect(cell.className).toMatch(/Warn/i);
  });

  it('aplica classe vermelha pra compliance < 70 (UPA Sul 65.0%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const table = screen.getByRole('table');
    const cell = within(table).getByText('65.0%');
    expect(cell.className).toMatch(/Bad/i);
  });

  it('tabela empty state quando byClinic é vazio', async () => {
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockKpis,
      byClinic: [],
      topAbsenceDoctors: [],
      perfectAttendanceDoctors: [],
    });
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Sem dados por UPA no período/i)).toBeInTheDocument();
    });
  });

  // ── Erros ─────────────────────────────────────────────────────────

  it('mostra erro NO_ORGAN_CONTEXT específico quando backend responde 403', async () => {
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NO_ORGAN_CONTEXT'),
    );
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument();
    });
  });

  it('mostra erro genérico em falhas de rede', async () => {
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network unreachable'),
    );
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os dados/i)).toBeInTheDocument();
    });
  });
});
