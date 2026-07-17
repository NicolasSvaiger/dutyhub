/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminFaturamento } from '../AdminFaturamento';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/billingApi', () => ({
  billingApi: {
    getReport: vi.fn(),
  },
}));

import { billingApi } from '../../../api/billingApi';

// jsdom doesn't implement canvas; stub getContext to avoid errors
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  scale: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
})) as any;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockReport = {
  year: 2026,
  month: 5,
  totalRevenue: 380000,
  totalHours: 2814,
  totalShiftsPlanned: 248,
  totalShiftsFulfilled: 220,
  totalDiscount: 14280,
  netPayable: 365720,
  fulfillmentPercent: 88.7,
  contracts: [
    {
      contractId: 'ct-1', contractNumber: 'CT-2024-0087',
      publicOrganId: 'po-1', publicOrganName: 'Prefeitura de São Paulo',
      monthlyValue: 220000, clinicCount: 2,
      shiftsPlanned: 152, shiftsFulfilled: 135,
      fulfillmentPercent: 88.8, discount: 8360, netPayable: 211640,
    },
    {
      contractId: 'ct-2', contractNumber: 'CT-2023-0142',
      publicOrganId: 'po-2', publicOrganName: 'Prefeitura de Guarulhos',
      monthlyValue: 160000, clinicCount: 2,
      shiftsPlanned: 96, shiftsFulfilled: 78,
      fulfillmentPercent: 81.3, discount: 5920, netPayable: 154080,
    },
  ],
  clinicHours: [
    { clinicId: 'c1', clinicName: 'UPA Vila Pereira', hours: 720 },
    { clinicId: 'c2', clinicName: 'UPA Centro', hours: 690 },
    { clinicId: 'c3', clinicName: 'UPA Zona Norte', hours: 720 },
    { clinicId: 'c4', clinicName: 'UPA Zona Sul', hours: 684 },
  ],
  doctors: [
    {
      userId: 'u1', userName: 'Dra. Jessica Lima', registrationNumber: 'CRM 5485-SP',
      clinicId: 'c1', clinicName: 'UPA Vila Pereira',
      shiftsPlanned: 16, shiftsFulfilled: 16, hoursWorked: 192,
      fulfillmentPercent: 100, grossAmount: 24000, discount: 0, netAmount: 24000,
    },
    {
      userId: 'u2', userName: 'Dra. Renata Silva', registrationNumber: 'CRM 4478-SP',
      clinicId: 'c2', clinicName: 'UPA Centro',
      shiftsPlanned: 16, shiftsFulfilled: 9, hoursWorked: 108,
      fulfillmentPercent: 56, grossAmount: 24000, discount: 10500, netAmount: 13500,
    },
    {
      userId: 'u3', userName: 'Dr. Marcelo Dias', registrationNumber: 'CRM 3345-SP',
      clinicId: 'c4', clinicName: 'UPA Zona Sul',
      shiftsPlanned: 12, shiftsFulfilled: 11, hoursWorked: 132,
      fulfillmentPercent: 91.7, grossAmount: 18000, discount: 1500, netAmount: 16500,
    },
  ],
};

function renderFat() {
  return render(
    <div id="adm-root">
      <AdminFaturamento onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminFaturamento />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (billingApi.getReport as ReturnType<typeof vi.fn>).mockResolvedValue(mockReport);
  });

  it('renderiza título e subtítulo', async () => {
    renderFat();
    expect(screen.getByText('Relatório de Faturamento')).toBeInTheDocument();
  });

  it('chama billingApi.getReport ao montar (mês/ano atual por default)', async () => {
    renderFat();
    await waitFor(() => {
      expect(billingApi.getReport).toHaveBeenCalledTimes(1);
    });
    const [year, month] = (billingApi.getReport as ReturnType<typeof vi.fn>).mock.calls[0];
    const now = new Date();
    expect(year).toBe(now.getFullYear());
    expect(month).toBe(now.getMonth() + 1);
  });

  it('exibe KPIs formatados em BRL', async () => {
    renderFat();
    await waitFor(() => {
      // Receita total → R$380k
      expect(screen.getByText('R$380k')).toBeInTheDocument();
      // Horas
      expect(screen.getByText('2.814h')).toBeInTheDocument();
      // Plantões previstos
      expect(screen.getByText('248')).toBeInTheDocument();
    });
  });

  it('exibe cards de contratos', async () => {
    renderFat();
    await waitFor(() => {
      // Os cards ficam dentro de .fat-top-grid (o filtro de contrato também usa o mesmo texto, então escopamos)
      const cards = document.querySelector('.fat-top-grid') as HTMLElement;
      expect(cards.textContent).toContain('Prefeitura de São Paulo');
      expect(cards.textContent).toContain('Prefeitura de Guarulhos');
      expect(cards.textContent).toContain('CT-2024-0087');
    });
  });

  it('exibe tabela com médicos', async () => {
    renderFat();
    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
      expect(screen.getByText('Dra. Renata Silva')).toBeInTheDocument();
      expect(screen.getByText('Dr. Marcelo Dias')).toBeInTheDocument();
    });
  });

  it('mostra linha de TOTAIS ao final da tabela', async () => {
    renderFat();
    await waitFor(() => {
      expect(screen.getByText('TOTAIS DO PERÍODO')).toBeInTheDocument();
    });
  });

  it('recarrega ao mudar o mês', async () => {
    renderFat();
    const user = userEvent.setup();
    await waitFor(() => expect(billingApi.getReport).toHaveBeenCalledTimes(1));
    // Clica em "Jan"
    await user.click(screen.getByText('Jan'));
    await waitFor(() => {
      expect(billingApi.getReport).toHaveBeenCalledTimes(2);
      const [, month] = (billingApi.getReport as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(month).toBe(1);
    });
  });

  it('filtra tabela por UPA', async () => {
    renderFat();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Dra. Jessica Lima'));

    // Seleciona a UPA "UPA Vila Pereira" no dropdown de UPA (último select "Todas as UPAs")
    const upaSelect = screen.getByDisplayValue('Todas as UPAs') as HTMLSelectElement;
    await user.selectOptions(upaSelect, 'c1');

    await waitFor(() => {
      expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument();
      expect(screen.queryByText('Dra. Renata Silva')).not.toBeInTheDocument();
    });
  });

  it('lida com erro da API sem crashar', async () => {
    (billingApi.getReport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server'));
    renderFat();
    await waitFor(() => {
      // Fallback estados: "Nenhum contrato no período" + "Nenhum profissional no período"
      expect(screen.getByText('Nenhum contrato no período.')).toBeInTheDocument();
      expect(screen.getByText('Nenhum profissional no período.')).toBeInTheDocument();
    });
  });

  it('mostra toast ao clicar em Exportar PDF', async () => {
    renderFat();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Dra. Jessica Lima'));
    await user.click(screen.getByText('Exportar PDF'));
    await waitFor(() => {
      const toast = document.querySelector('.fat-toast') as HTMLElement;
      expect(toast.textContent).toContain('PDF gerado com sucesso');
    });
  });

  it('mostra toast ao clicar em Exportar Excel', async () => {
    renderFat();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Dra. Jessica Lima'));
    await user.click(screen.getByText('Exportar Excel'));
    await waitFor(() => {
      const toast = document.querySelector('.fat-toast') as HTMLElement;
      expect(toast.textContent).toContain('Excel gerado com sucesso');
    });
  });

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    render(<div id="adm-root"><AdminFaturamento onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Relatório de Faturamento'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
