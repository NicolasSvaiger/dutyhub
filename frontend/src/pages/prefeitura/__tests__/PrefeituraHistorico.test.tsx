/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraHistorico } from '../PrefeituraHistorico';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getClinics: vi.fn(),
    getUnitTimeline: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockClinics = [
  { clinicId: 'c1', name: 'UPA Centro', address: null, contractNumber: null },
  { clinicId: 'c2', name: 'UPA Norte', address: null, contractNumber: null },
];

const mockTimeline = {
  clinicId: 'c1',
  clinicName: 'UPA Centro',
  from: '2026-07-08',
  to: '2026-07-18',
  totalShifts: 3,
  entradas: 2,
  saidas: 1,
  atrasos: 1,
  ausencias: 1,
  items: [
    {
      shiftId: 's1', userId: 'u1', userName: 'Dra. Ana', professionalType: 'Medico', date: '2026-07-15T00:00:00Z',
      turno: 'manha', expectedTime: '07:00:00', checkInTime: '2026-07-15T07:02:00Z',
      checkOutTime: '2026-07-15T19:00:00Z', type: 'in', minutesLate: null,
    },
    {
      shiftId: 's2', userId: 'u2', userName: 'Enf. Bruno', professionalType: 'Enfermeiro', date: '2026-07-15T00:00:00Z',
      turno: 'manha', expectedTime: '07:00:00', checkInTime: '2026-07-15T07:35:00Z',
      checkOutTime: null, type: 'late', minutesLate: 20,
    },
    {
      shiftId: 's3', userId: 'u3', userName: 'Dra. Carla', professionalType: 'Medico', date: '2026-07-14T00:00:00Z',
      turno: 'noite', expectedTime: '19:00:00', checkInTime: null,
      checkOutTime: null, type: 'absent', minutesLate: null,
    },
  ],
};

describe('<PrefeituraHistorico />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
    (prefeituraApi.getUnitTimeline as ReturnType<typeof vi.fn>).mockResolvedValue(mockTimeline);
  });

  it('chama getClinics no mount e getUnitTimeline com a primeira UPA', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(prefeituraApi.getClinics).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(prefeituraApi.getUnitTimeline).toHaveBeenCalledTimes(1));
    const args = (prefeituraApi.getUnitTimeline as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe('c1');
  });

  it('renderiza o seletor de UPA com as clínicas do escopo', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
  });

  it('clicar em outra UPA dispara nova fetch com o novo clinicId', async () => {
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getUnitTimeline).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('UPA Norte'));

    await waitFor(() => expect(prefeituraApi.getUnitTimeline).toHaveBeenCalledTimes(2));
    const lastArgs = (prefeituraApi.getUnitTimeline as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastArgs[0]).toBe('c2');
  });

  it('renderiza os 5 KPIs (total/entradas/saidas/atrasos/ausencias)', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/Total de plantões/i)).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument(); // totalShifts
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // entradas
    expect(screen.getAllByText('1').length).toBeGreaterThan(0); // saidas/atrasos/ausencias
  });

  it('renderiza timeline agrupada por dia com nomes dos médicos', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());
    expect(screen.getByText('Enf. Bruno')).toBeInTheDocument();
    expect(screen.getByText('Dra. Carla')).toBeInTheDocument();
  });

  it('renderiza badge de tipo profissional na timeline', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());
    expect(screen.getAllByText('Médico').length).toBeGreaterThan(0);
    expect(screen.getByText('Enfermeiro(a)')).toBeInTheDocument();
  });

  it('alternar pra visão "Tabela" renderiza a tabela com colunas esperadas', async () => {
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Tabela/i }));

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('Profissional');
    expect(headers).toContain('Data');
    expect(headers).toContain('Turno');
  });

  it('filtro de evento "Atrasos" reduz a lista aos itens type=late', async () => {
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());

    const select = document.getElementById('hist-evento') as HTMLSelectElement;
    await user.selectOptions(select, 'late');

    await waitFor(() => {
      expect(screen.queryByText('Dra. Ana')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Enf. Bruno')).toBeInTheDocument();
  });

  it('mudar turno dispara nova fetch com o param turno', async () => {
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getUnitTimeline).toHaveBeenCalledTimes(1));

    const select = document.getElementById('hist-turno') as HTMLSelectElement;
    await user.selectOptions(select, 'noite');

    await waitFor(() => expect(prefeituraApi.getUnitTimeline).toHaveBeenCalledTimes(2));
    const lastArgs = (prefeituraApi.getUnitTimeline as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastArgs[3]).toBe('noite');
  });

  it('empty state quando não há UPAs no escopo', async () => {
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/Selecione uma UPA/i)).toBeInTheDocument());
  });

  it('empty state quando a timeline não tem itens', async () => {
    (prefeituraApi.getUnitTimeline as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockTimeline,
      items: [],
      totalShifts: 0,
      entradas: 0,
      saidas: 0,
      atrasos: 0,
      ausencias: 0,
    });
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/Nenhum registro encontrado/i)).toBeInTheDocument());
  });

  it('mostra erro NO_ORGAN_CONTEXT específico quando backend responde 403', async () => {
    (prefeituraApi.getUnitTimeline as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NO_ORGAN_CONTEXT'),
    );
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument());
  });
});
