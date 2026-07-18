/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PrefeituraRealtime } from '../PrefeituraRealtime';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getRealtime: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockRealtime = {
  asOf: '2026-07-17T14:30:00Z',
  totalClinics: 3,
  totalExpectedNow: 15,
  totalPresentNow: 12,
  totalAbsentNow: 3,
  clinics: [
    {
      clinicId: 'c1',
      name: 'UPA Centro',
      expectedCount: 5,
      presentCount: 5,
      absentCount: 0,
      alertLevel: 'green',
      absentUserNames: [],
    },
    {
      clinicId: 'c2',
      name: 'UPA Norte',
      expectedCount: 6,
      presentCount: 4,
      absentCount: 2,
      alertLevel: 'yellow',
      absentUserNames: ['Dra. Ana', 'Dr. Bruno'],
    },
    {
      clinicId: 'c3',
      name: 'UPA Sul',
      expectedCount: 4,
      presentCount: 3,
      absentCount: 1,
      alertLevel: 'red',
      absentUserNames: ['Dra. Carla'],
    },
  ],
};

describe('<PrefeituraRealtime />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue(mockRealtime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama getRealtime no mount', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));
  });

  it('renderiza totalizadores no header', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('15')).toBeInTheDocument());
    // totalClinics=3, expectedNow=15, presentNow=12, absentNow=3
    expect(screen.getByText('12')).toBeInTheDocument();
    // totalClinics=3 e absentNow=3 podem ambos ser "3"
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(2);
  });

  it('renderiza clínicas com nomes', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
    expect(screen.getByText('UPA Sul')).toBeInTheDocument();
  });

  it('renderiza names dos ausentes por clínica', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());
    expect(screen.getByText('Dr. Bruno')).toBeInTheDocument();
    expect(screen.getByText('Dra. Carla')).toBeInTheDocument();
  });

  it('aplica classe green/yellow/red por alertLevel', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());

    // Verifica que existem 3 clinicCards, cada uma com classe diferente
    const cards = document.querySelectorAll('[class*="clinicCard"]');
    expect(cards.length).toBe(3);
    // As classes green/yellow/red do CSS Module ficam no className
    const classNames = Array.from(cards).map((c) => c.className);
    expect(classNames.some((cn) => cn.includes('green'))).toBe(true);
    expect(classNames.some((cn) => cn.includes('yellow'))).toBe(true);
    expect(classNames.some((cn) => cn.includes('red'))).toBe(true);
  });

  it('mostra timestamp asOf formatado', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Atualizado às/i)).toBeInTheDocument());
  });

  it('polling refetch a cada 30s (setInterval)', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    // Avança 30s → deve disparar refetch
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(2));

    // Mais 30s → 3ª chamada
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(3));
  });

  it('unmount para o polling', async () => {
    const { unmount } = render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);

    // Não deve fazer novas chamadas após unmount
    expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1);
  });

  it('empty state pra clinics vazias', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockRealtime,
      clinics: [],
    });
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Nenhuma UPA em operação/i)).toBeInTheDocument());
  });

  it('error state quando fetch falha', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NO_ORGAN_CONTEXT'));
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument());
  });
});
