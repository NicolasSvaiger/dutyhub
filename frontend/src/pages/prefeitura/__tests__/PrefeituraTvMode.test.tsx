/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PrefeituraTvMode } from '../PrefeituraTvMode';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getRealtime: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockRealtime = {
  asOf: '2026-07-17T14:30:00Z',
  totalClinics: 3,
  totalExpectedNow: 20,
  totalPresentNow: 17,
  totalAbsentNow: 3,
  clinics: [
    {
      clinicId: 'c1',
      name: 'UPA Alpha',
      expectedCount: 8,
      presentCount: 8,
      absentCount: 0,
      alertLevel: 'green',
      absentUserNames: [],
    },
    {
      clinicId: 'c2',
      name: 'UPA Beta',
      expectedCount: 6,
      presentCount: 5,
      absentCount: 1,
      alertLevel: 'yellow',
      absentUserNames: ['Dra. Ana'],
    },
    {
      clinicId: 'c3',
      name: 'UPA Gama',
      expectedCount: 6,
      presentCount: 4,
      absentCount: 2,
      alertLevel: 'red',
      absentUserNames: ['Dr. Beto', 'Dra. Carla'],
    },
  ],
};

function renderTv() {
  return render(
    <MemoryRouter>
      <PrefeituraTvMode />
    </MemoryRouter>,
  );
}

describe('<PrefeituraTvMode />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.useFakeTimers();
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue(mockRealtime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama getRealtime no mount', async () => {
    renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));
  });

  it('renderiza brand + tagline', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('24p7')).toBeInTheDocument());
    expect(screen.getByText(/Monitoramento em tempo real/i)).toBeInTheDocument();
  });

  it('renderiza relógio wall-clock', async () => {
    renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalled());
    // Regex genérica HH:MM (00-23)
    const clockRegex = /\d{2}:\d{2}/;
    // Múltiplos matches possíveis (data updates etc.) — pelo menos 1
    const matches = screen.getAllByText(clockRegex);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza totalizadores gigantes', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('20')).toBeInTheDocument());
    expect(screen.getByText('17')).toBeInTheDocument();
    // 3 aparece como totalClinics + absentNow
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(2);
  });

  it('renderiza clínicas com nomes', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('UPA Alpha')).toBeInTheDocument());
    expect(screen.getByText('UPA Beta')).toBeInTheDocument();
    expect(screen.getByText('UPA Gama')).toBeInTheDocument();
  });

  it('aplica classe green/yellow/red por alertLevel', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('UPA Alpha')).toBeInTheDocument());

    const cards = document.querySelectorAll('[class*="tvClinic"]');
    // Filtra apenas os cards, não sub-elementos (name/stats)
    const clinicCards = Array.from(cards).filter((c) =>
      c.className.match(/tvClinic\b/) || c.className.match(/tvClinic[_-]/),
    );
    const classNames = clinicCards.map((c) => c.className).join(' ');
    expect(classNames).toMatch(/green/i);
    expect(classNames).toMatch(/yellow/i);
    expect(classNames).toMatch(/red/i);
  });

  it('polling refetch a cada 20s (mais agressivo que Realtime)', async () => {
    renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    // Após 20s deve refetch
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(2));

    // Após mais 20s → 3ª chamada
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(3));
  });

  it('unmount para o polling e o clock tick', async () => {
    const { unmount } = renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1);
  });

  it('clicar em "Sair do Modo TV" navega pra /prefeitura com replace', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('UPA Alpha')).toBeInTheDocument());

    // useFakeTimers pode fazer userEvent travar; usar real timers pra este teste
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Sair do Modo TV/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/prefeitura', { replace: true });
  });

  it('mostra error quando getRealtime falha', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderTv();
    await vi.waitFor(() => expect(screen.getByText(/Não foi possível carregar/i)).toBeInTheDocument());
  });
});
