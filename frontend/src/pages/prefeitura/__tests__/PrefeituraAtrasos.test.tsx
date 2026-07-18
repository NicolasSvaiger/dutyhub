/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraAtrasos } from '../PrefeituraAtrasos';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getAbsences: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockLates = [
  {
    id: 'a1', type: 'late', userId: 'u1', userName: 'Dra. Ana', clinicId: 'c1', clinicName: 'UPA Centro',
    date: '2026-07-15', shiftLabel: 'Noturno', minutesLate: 45, justified: false, substituteName: null,
  },
  {
    id: 'a2', type: 'late', userId: 'u2', userName: 'Dr. Bruno', clinicId: 'c2', clinicName: 'UPA Norte',
    date: '2026-07-16', shiftLabel: 'Diurno', minutesLate: 12, justified: true, substituteName: null,
  },
];

describe('<PrefeituraAtrasos />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockResolvedValue(mockLates);
    (prefeituraApi.downloadReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('chama getAbsences com type="late" no mount', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(1));
    const lastCall = (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(lastCall[2]).toBe('late');
  });

  it('renderiza tabela com userName e clinicName', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());
    expect(screen.getByText('Dr. Bruno')).toBeInTheDocument();
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
  });

  it('renderiza minutesLate como badge', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('45 min')).toBeInTheDocument());
    expect(screen.getByText('12 min')).toBeInTheDocument();
  });

  it('badge vermelha pra minutesLate >= 30 (45 min)', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('45 min')).toBeInTheDocument());
    expect(screen.getByText('45 min').className).toMatch(/Bad/i);
  });

  it('badge laranja pra minutesLate < 30 (12 min)', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('12 min')).toBeInTheDocument());
    expect(screen.getByText('12 min').className).toMatch(/Warn/i);
  });

  it('renderiza Sim/Não pra justified', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('Sim')).toBeInTheDocument());
    expect(screen.getByText('Não')).toBeInTheDocument();
  });

  it('empty state quando não há atrasos', async () => {
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText(/Sem atrasos no período/i)).toBeInTheDocument());
  });

  it('botão exportar chama downloadReport("atrasos", ...)', async () => {
    render(<PrefeituraAtrasos />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('atrasos', 'pdf', expect.any(Object));
    });
  });

  it('mudar período e aplicar dispara nova fetch', async () => {
    render(<PrefeituraAtrasos />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(1));

    const from = document.getElementById('atr-from') as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-01-01');
    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(2));
    expect((prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('2026-01-01');
  });

  it('error genérico é mostrado ao falhar fetch', async () => {
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText(/Não foi possível carregar os dados/i)).toBeInTheDocument());
  });
});
