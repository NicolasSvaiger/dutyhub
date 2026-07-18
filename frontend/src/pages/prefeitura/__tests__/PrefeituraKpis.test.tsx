/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  byClinic: [
    { clinicId: 'c1', clinicName: 'UPA Centro', complianceRate: 95.2, expectedShifts: 60, coveredShifts: 57, absences: 2, lateEvents: 4 },
    { clinicId: 'c2', clinicName: 'UPA Norte', complianceRate: 82.1, expectedShifts: 70, coveredShifts: 58, absences: 6, lateEvents: 8 },
    { clinicId: 'c3', clinicName: 'UPA Sul', complianceRate: 65.0, expectedShifts: 70, coveredShifts: 45, absences: 4, lateEvents: 6 },
  ],
};

describe('<PrefeituraKpis />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockResolvedValue(mockKpis);
  });

  // ── Fetch inicial ──────────────────────────────────────────────────

  it('chama getKpis() no mount com defaults from/to (últimos 30 dias)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(prefeituraApi.getKpis).toHaveBeenCalledTimes(1);
    });
    const args = (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mock.calls[0];
    // ISO date shape yyyy-MM-dd
    expect(args[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // ── Hero ───────────────────────────────────────────────────────────

  it('renderiza card hero com % de cumprimento global (88.4%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByText('88.4%')).toBeInTheDocument());
    expect(screen.getByText(/Cumprimento global/i)).toBeInTheDocument();
  });

  it('mostra período no hero com formato pt-BR (dd/mm/yyyy → dd/mm/yyyy)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      // Vai depender do timezone; validar por regex de datas brasileiras
      expect(screen.getByText(/\d{2}\/\d{2}\/\d{4}.*→.*\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
    });
  });

  // ── Grid de KPIs ───────────────────────────────────────────────────

  it('renderiza grid com 6 cards (expected, covered, absences, late, avg late, subst rate)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText(/Plantões previstos/i)).toBeInTheDocument();
    });
    expect(screen.getByText('200')).toBeInTheDocument(); // expected
    expect(screen.getByText('177')).toBeInTheDocument(); // covered
    expect(screen.getByText('12')).toBeInTheDocument(); // absences
    expect(screen.getByText('18')).toBeInTheDocument(); // late events
    expect(screen.getByText('14.5')).toBeInTheDocument(); // avg late minutes
    expect(screen.getByText('6.5%')).toBeInTheDocument(); // substitution rate
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

  it('mudar filtro e clicar em "Aplicar" dispara nova fetch com valores novos', async () => {
    render(<PrefeituraKpis />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getKpis).toHaveBeenCalledTimes(1));

    const from = document.getElementById('kpis-from') as HTMLInputElement;
    const to = document.getElementById('kpis-to') as HTMLInputElement;

    await user.clear(from);
    await user.type(from, '2026-01-01');
    await user.clear(to);
    await user.type(to, '2026-06-30');

    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => {
      expect(prefeituraApi.getKpis).toHaveBeenCalledTimes(2);
    });
    const lastArgs = (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastArgs[0]).toBe('2026-01-01');
    expect(lastArgs[1]).toBe('2026-06-30');
  });

  it('botão Aplicar fica disabled durante loading', async () => {
    // Deixar promise pendente
    let resolveFn: ((v: typeof mockKpis) => void) | null = null;
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<typeof mockKpis>((resolve) => {
        resolveFn = resolve;
      }),
    );
    render(<PrefeituraKpis />);
    // Durante loading inicial, botão está disabled
    const btn = screen.getByRole('button', { name: /Carregando/i });
    expect(btn).toBeDisabled();

    resolveFn?.(mockKpis);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Aplicar/i })).not.toBeDisabled();
    });
  });

  // ── Tabela por UPA ─────────────────────────────────────────────────

  it('renderiza tabela com todas as clínicas', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => {
      expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    });
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
    expect(screen.getByText('UPA Sul')).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByText('95.2%')).toBeInTheDocument());
    const cell = screen.getByText('95.2%');
    expect(cell.className).toMatch(/Good/i);
  });

  it('aplica classe laranja pra compliance entre 70 e 89 (UPA Norte 82.1%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByText('82.1%')).toBeInTheDocument());
    const cell = screen.getByText('82.1%');
    expect(cell.className).toMatch(/Warn/i);
  });

  it('aplica classe vermelha pra compliance < 70 (UPA Sul 65.0%)', async () => {
    render(<PrefeituraKpis />);
    await waitFor(() => expect(screen.getByText('65.0%')).toBeInTheDocument());
    const cell = screen.getByText('65.0%');
    expect(cell.className).toMatch(/Bad/i);
  });

  it('tabela empty state quando byClinic é vazio', async () => {
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockKpis,
      byClinic: [],
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
