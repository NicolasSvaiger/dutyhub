/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraAtrasos } from '../PrefeituraAtrasos';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getAbsences: vi.fn(),
    getClinics: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockLates = [
  {
    id: 'a1', type: 'late', userId: 'u1', userName: 'Dra. Ana', professionalType: 'Medico', clinicId: 'c1', clinicName: 'UPA Centro',
    date: '2026-07-15', shiftLabel: 'Noturno', minutesLate: 45, justified: false, substituteName: null,
  },
  {
    id: 'a2', type: 'late', userId: 'u2', userName: 'Enf. Bruno', professionalType: 'Enfermeiro', clinicId: 'c2', clinicName: 'UPA Norte',
    date: '2026-07-16', shiftLabel: 'Diurno', minutesLate: 12, justified: true, substituteName: null,
  },
];

describe('<PrefeituraAtrasos />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockResolvedValue(mockLates);
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prefeituraApi.downloadReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('chama getAbsences com type="late" e tolerância padrão (15) no mount', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(1));
    const lastCall = (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(lastCall[2]).toBe('late');
    expect(lastCall[3]).toBe(15);
  });

  it('renderiza tabela com userName e clinicName', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getAllByText('Dra. Ana').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Enf. Bruno').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPA Centro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPA Norte').length).toBeGreaterThan(0);
  });

  it('renderiza minutesLate como pill de atraso', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('+45 min')).toBeInTheDocument());
    expect(screen.getByText('+12 min')).toBeInTheDocument();
  });

  it('badge "Grave" pra minutesLate > 60 não aparece aqui, mas "Leve" pra 12 e 45 min (<=30 e <=60)', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText('+45 min')).toBeInTheDocument());
    // 45 min está na faixa "Médio" (31-60), 12 min está em "Leve" (<=30).
    expect(screen.getByText('Médio')).toBeInTheDocument();
    expect(screen.getByText('Leve')).toBeInTheDocument();
  });

  it('renderiza badge de tipo profissional por linha', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getAllByText('Dra. Ana').length).toBeGreaterThan(0));
    // "Médico"/"Enfermeiro(a)" também aparecem como <option> do novo filtro
    // de tipo — filtrar só o badge (elemento não-OPTION).
    const medicoBadge = screen.getAllByText('Médico').find((el) => el.tagName !== 'OPTION');
    const enfermeiroBadge = screen.getAllByText('Enfermeiro(a)').find((el) => el.tagName !== 'OPTION');
    expect(medicoBadge).toBeInTheDocument();
    expect(enfermeiroBadge).toBeInTheDocument();
  });

  it('filtra por tipo de profissional via select', async () => {
    render(<PrefeituraAtrasos />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Ana').length).toBeGreaterThan(0));

    const select = screen.getByLabelText(/Tipo de profissional/i);
    await user.selectOptions(select, 'Enfermeiro');

    expect(screen.getAllByText('Enf. Bruno').length).toBeGreaterThan(0);
    expect(screen.queryByText('+45 min')).not.toBeInTheDocument();
  });

  it('empty state quando não há atrasos', async () => {
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText(/Sem atrasos no período/i)).toBeInTheDocument());
  });

  it('botão exportar chama downloadReport("atrasos", ...)', async () => {
    render(<PrefeituraAtrasos />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Ana').length).toBeGreaterThan(0));

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

  it('mover o slider de tolerância dispara nova fetch com o novo valor', async () => {
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(1));

    const slider = screen.getByLabelText(/Tolerância de Atraso/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '30' } });

    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(2));
    const lastCall = (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastCall[3]).toBe(30);
  });

  it('error genérico é mostrado ao falhar fetch', async () => {
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    render(<PrefeituraAtrasos />);
    await waitFor(() => expect(screen.getByText(/Não foi possível carregar os dados/i)).toBeInTheDocument());
  });
});
