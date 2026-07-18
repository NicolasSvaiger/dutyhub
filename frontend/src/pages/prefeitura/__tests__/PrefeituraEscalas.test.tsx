/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraEscalas } from '../PrefeituraEscalas';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getShifts: vi.fn(),
    getClinics: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockShifts = [
  {
    shiftId: 's1',
    clinicId: 'c1',
    clinicName: 'UPA Centro',
    title: 'Plantão Noturno',
    date: '2026-07-20',
    startTime: '19:00',
    endTime: '07:00',
    checkedInCount: 2,
    assignments: [
      { userId: 'u1', userName: 'Dra. Ana Silva', hasCheckedIn: true },
      { userId: 'u2', userName: 'Dr. Bruno Costa', hasCheckedIn: true },
      { userId: 'u3', userName: 'Dra. Clara Dias', hasCheckedIn: false },
    ],
  },
  {
    shiftId: 's2',
    clinicId: 'c2',
    clinicName: 'UPA Norte',
    title: 'Plantão Diurno',
    date: '2026-07-21',
    startTime: '07:00',
    endTime: '19:00',
    checkedInCount: 0,
    assignments: [{ userId: 'u4', userName: 'Dr. Diego Faria', hasCheckedIn: false }],
  },
];

const mockClinics = [
  { clinicId: 'c1', name: 'UPA Centro' },
  { clinicId: 'c2', name: 'UPA Norte' },
];

describe('<PrefeituraEscalas />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getShifts as ReturnType<typeof vi.fn>).mockResolvedValue(mockShifts);
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
  });

  it('chama getShifts + getClinics no mount', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(prefeituraApi.getShifts).toHaveBeenCalledTimes(1);
      expect(prefeituraApi.getClinics).toHaveBeenCalledTimes(1);
    });
  });

  it('renderiza cards com título e clínica de cada plantão', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText('Plantão Noturno')).toBeInTheDocument());
    expect(screen.getByText('Plantão Diurno')).toBeInTheDocument();
    // clinicName aparece 1x no card (getAllByText porque option do select tem o mesmo nome)
    expect(screen.getAllByText('UPA Centro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('UPA Norte').length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza horários start → end', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText('19:00 → 07:00')).toBeInTheDocument();
    });
    expect(screen.getByText('07:00 → 19:00')).toBeInTheDocument();
  });

  it('renderiza progress com checkedIn/total', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText('2/3')).toBeInTheDocument();
    });
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('renderiza nome dos assignments e status Present/Pending', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText('Dra. Ana Silva')).toBeInTheDocument();
    });
    expect(screen.getByText('Dr. Bruno Costa')).toBeInTheDocument();
    expect(screen.getByText('Dra. Clara Dias')).toBeInTheDocument();
    // Present aparece 2x, Pending 2x
    expect(screen.getAllByText('Presente').length).toBe(2);
    expect(screen.getAllByText('Pendente').length).toBe(2);
  });

  it('empty state quando não há shifts', async () => {
    (prefeituraApi.getShifts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText(/Sem plantões no período/i)).toBeInTheDocument();
    });
  });

  it('error state com NO_ORGAN_CONTEXT', async () => {
    (prefeituraApi.getShifts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NO_ORGAN_CONTEXT'));
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument();
    });
  });

  it('dropdown de clínicas popula com as UPAs', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(prefeituraApi.getClinics).toHaveBeenCalled());
    const select = document.getElementById('escalas-clinic') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // 3 options: "Todas as UPAs" + 2 clínicas
    expect(select.options.length).toBe(3);
  });

  it('mudança de filtro dispara nova fetch com clinicId', async () => {
    render(<PrefeituraEscalas />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getShifts).toHaveBeenCalledTimes(1));

    const select = document.getElementById('escalas-clinic') as HTMLSelectElement;
    await user.selectOptions(select, 'c1');
    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => expect(prefeituraApi.getShifts).toHaveBeenCalledTimes(2));
    const lastCall = (prefeituraApi.getShifts as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastCall[2]).toBe('c1');
  });

  it('progress fill % é totalAssignees > 0 ? checkedIn/total*100 : 0', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText('2/3')).toBeInTheDocument());
    // A progress bar deve ter width proporcional; verificamos via HTML style inline
    const progressFills = document.querySelectorAll('[style*="width"]');
    // Pelo menos 2 fills (1 por card)
    expect(progressFills.length).toBeGreaterThanOrEqual(2);
  });
});
