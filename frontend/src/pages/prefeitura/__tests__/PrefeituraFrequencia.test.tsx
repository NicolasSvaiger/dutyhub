/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraFrequencia } from '../PrefeituraFrequencia';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getFrequency: vi.fn(),
    getClinics: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockData = [
  { clinicId: 'c1', clinicName: 'UPA Centro', date: '2026-07-15', expected: 10, actual: 9, presenceRate: 92.5 },
  { clinicId: 'c2', clinicName: 'UPA Norte', date: '2026-07-15', expected: 8, actual: 6, presenceRate: 80.0 },
  { clinicId: 'c3', clinicName: 'UPA Sul', date: '2026-07-15', expected: 12, actual: 6, presenceRate: 55.0 },
];

describe('<PrefeituraFrequencia />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getFrequency as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prefeituraApi.downloadReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('chama getFrequency no mount', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(prefeituraApi.getFrequency).toHaveBeenCalledTimes(1));
  });

  it('renderiza tabela com todas as clínicas', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
    expect(screen.getByText('UPA Sul')).toBeInTheDocument();
  });

  it('renderiza expected e actual dos itens', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('aplica classe verde pra presenceRate >= 90 (92.5%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('92.5%')).toBeInTheDocument());
    expect(screen.getByText('92.5%').className).toMatch(/Good/i);
  });

  it('aplica classe laranja pra 70-89 (80.0%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('80.0%')).toBeInTheDocument());
    expect(screen.getByText('80.0%').className).toMatch(/Warn/i);
  });

  it('aplica classe vermelha pra < 70 (55.0%)', async () => {
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText('55.0%')).toBeInTheDocument());
    expect(screen.getByText('55.0%').className).toMatch(/Bad/i);
  });

  it('empty state quando resultado vazio', async () => {
    (prefeituraApi.getFrequency as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText(/Sem registros de frequência/i)).toBeInTheDocument());
  });

  it('botão exportar PDF chama downloadReport("frequency", "pdf")', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('frequency', 'pdf', expect.any(Object));
    });
  });

  it('botão exportar Excel chama downloadReport("frequency", "xlsx")', async () => {
    render(<PrefeituraFrequencia />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Exportar Excel/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('frequency', 'xlsx', expect.any(Object));
    });
  });

  it('botões de export ficam disabled com resultado vazio', async () => {
    (prefeituraApi.getFrequency as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraFrequencia />);
    await waitFor(() => expect(screen.getByText(/Sem registros/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Exportar PDF/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Exportar Excel/i })).toBeDisabled();
  });
});
