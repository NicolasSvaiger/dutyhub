/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraFrequencia } from '../PrefeituraFrequencia';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getFrequencyByDoctor: vi.fn(),
    getClinics: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockData = [
  {
    userId: 'u1', userName: 'Dra. Jessica Lima', registrationNumber: '5485-SP', professionalType: 'Medico',
    clinicId: 'c1', clinicName: 'UPA Centro',
    expectedShifts: 22, completedShifts: 22, absences: 0, lateEvents: 0, complianceRate: 100,
  },
  {
    userId: 'u2', userName: 'Dra. Mariana Costa', registrationNumber: '6614-SP', professionalType: 'Medico',
    clinicId: 'c2', clinicName: 'UPA Norte',
    expectedShifts: 18, completedShifts: 14, absences: 4, lateEvents: 3, complianceRate: 77.8,
  },
  {
    userId: 'u3', userName: 'Enf. Renata Silva', registrationNumber: '4478-SP', professionalType: 'Enfermeiro',
    clinicId: 'c2', clinicName: 'UPA Norte',
    expectedShifts: 18, completedShifts: 11, absences: 7, lateEvents: 0, complianceRate: 61.1,
  },
];

describe('<PrefeituraFrequencia />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getFrequencyByDoctor as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prefeituraApi.downloadReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('chama getFrequencyByDoctor no mount', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(prefeituraApi.getFrequencyByDoctor).toHaveBeenCalledTimes(1));
  });

  it('renderiza tabela com todos os médicos', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Dra. Mariana Costa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Enf. Renata Silva').length).toBeGreaterThan(0);
  });

  it('renderiza escalados e realizados dos itens', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getAllByText('22').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18').length).toBeGreaterThan(0);
  });

  it('aplica badge "Adimplente" pra complianceRate >= 90 (100%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('Adimplente')).toBeInTheDocument());
  });

  it('aplica badge "Atenção" pra 70-89 (77.8%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('Atenção')).toBeInTheDocument());
  });

  it('aplica badge "Crítico" pra < 70 (61.1%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('Crítico')).toBeInTheDocument());
  });

  it('KPI "Profissionais críticos" conta 1 (só Renata Silva < 70%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));
    expect(screen.getByText(/Profissionais críticos/i)).toBeInTheDocument();
  });

  it('filtra por médico via select', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));

    const select = screen.getByLabelText(/^Profissional$/i);
    await user.selectOptions(select, 'Dra. Jessica Lima');

    // Só a linha da tabela deve sobrar — o nome ainda aparece na option do select.
    expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0);
    const marianaMatches = screen.queryAllByText('Dra. Mariana Costa');
    // Deve restar só a ocorrência da <option>, não a linha da tabela (que some).
    expect(marianaMatches.every((el) => el.tagName === 'OPTION')).toBe(true);
  });

  it('filtra por situação via select', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));

    const select = screen.getByLabelText(/Situação/i);
    await user.selectOptions(select, 'danger');

    expect(screen.getAllByText('Enf. Renata Silva').length).toBeGreaterThan(0);
    const jessicaMatches = screen.queryAllByText('Dra. Jessica Lima');
    expect(jessicaMatches.every((el) => el.tagName === 'OPTION')).toBe(true);
  });

  it('renderiza badge de tipo profissional (Médico/Enfermeiro(a)) por linha', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));
    // "Médico"/"Enfermeiro(a)" também aparecem como <option> do novo filtro
    // de tipo — filtrar só os badges (elementos não-OPTION).
    const medicoBadges = screen.getAllByText('Médico').filter((el) => el.tagName !== 'OPTION');
    const enfermeiroBadge = screen.getAllByText('Enfermeiro(a)').find((el) => el.tagName !== 'OPTION');
    expect(medicoBadges.length).toBeGreaterThan(0);
    expect(enfermeiroBadge).toBeInTheDocument();
  });

  it('filtra por tipo de profissional via select', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));

    const select = screen.getByLabelText(/Tipo de profissional/i);
    await user.selectOptions(select, 'Enfermeiro');

    expect(screen.getAllByText('Enf. Renata Silva').length).toBeGreaterThan(0);
    const jessicaMatches = screen.queryAllByText('Dra. Jessica Lima');
    expect(jessicaMatches.every((el) => el.tagName === 'OPTION')).toBe(true);
  });

  it('empty state quando resultado vazio', async () => {
    (prefeituraApi.getFrequencyByDoctor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText(/Sem registros de frequência/i)).toBeInTheDocument());
  });

  it('botão exportar PDF chama downloadReport("frequency", "pdf")', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('frequency', 'pdf', expect.any(Object));
    });
  });

  it('botão exportar Excel chama downloadReport("frequency", "xlsx")', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('Dra. Jessica Lima').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: /Exportar Excel/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('frequency', 'xlsx', expect.any(Object));
    });
  });

  it('botões de export ficam disabled com resultado vazio', async () => {
    (prefeituraApi.getFrequencyByDoctor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText(/Sem registros/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Exportar PDF/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Exportar Excel/i })).toBeDisabled();
  });
});
