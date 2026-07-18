/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraHistorico } from '../PrefeituraHistorico';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getHistory: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

function makePage(page: number, totalPages: number, itemCount: number = 5) {
  return {
    page,
    pageSize: 30,
    totalCount: totalPages * 30,
    totalPages,
    items: Array.from({ length: itemCount }, (_, i) => ({
      timestamp: `2026-07-15T${String(i).padStart(2, '0')}:00:00Z`,
      type: i % 2 === 0 ? 'checkin' : 'absence',
      title: `Evento ${page}-${i}`,
      details: `Detalhes ${i}`,
      userId: `u${i}`,
      userName: `Profissional ${i}`,
      clinicId: `c${i}`,
      clinicName: `UPA ${i}`,
    })),
  };
}

describe('<PrefeituraHistorico />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue(makePage(1, 3, 5));
    (prefeituraApi.downloadReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('chama getHistory no mount com page=1', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(1));
    const args = (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[4]).toBe(1); // page
    expect(args[5]).toBe(30); // pageSize
  });

  it('renderiza itens com título + userName + clinicName', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText('Evento 1-0')).toBeInTheDocument());
    expect(screen.getByText('Evento 1-1')).toBeInTheDocument();
    expect(screen.getByText('Profissional 0')).toBeInTheDocument();
    expect(screen.getByText('UPA 0')).toBeInTheDocument();
  });

  it('renderiza pageInfo "Página 1 de 3"', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument());
  });

  it('botão Anterior fica disabled na página 1', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Anterior/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Anterior/i })).toBeDisabled();
  });

  it('botão Próxima habilitado quando page < totalPages', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Próxima/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Próxima/i })).not.toBeDisabled();
  });

  it('clicar em Próxima chama getHistory com page=2', async () => {
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(1, 3, 5));
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(2, 3, 5));
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Próxima/i }));

    await waitFor(() => {
      expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(2);
    });
    const lastArgs = (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastArgs[4]).toBe(2);
  });

  it('Anterior fica habilitado após ir pra page 2', async () => {
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(1, 3, 5));
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(2, 3, 5));
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Próxima/i }));
    await waitFor(() => expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Anterior/i })).not.toBeDisabled();
  });

  it('Próxima fica disabled na última página', async () => {
    // Backend retorna 1 página apenas (page=1 totalPages=1) — Próxima já vem disabled
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue(makePage(1, 1, 5));
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Próxima/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Próxima/i })).toBeDisabled();
  });

  it('filtro por tipo dispara nova fetch com type param', async () => {
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue(makePage(1, 1, 3));
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(1));

    const select = document.getElementById('hist-type') as HTMLSelectElement;
    await user.selectOptions(select, 'checkin');
    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(2));
    expect((prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mock.calls[1][2]).toBe('checkin');
  });

  it('busca livre dispara fetch com search param', async () => {
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(1));

    const searchInput = document.getElementById('hist-search') as HTMLInputElement;
    await user.type(searchInput, 'Ana Silva');
    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(2));
    expect((prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mock.calls[1][3]).toBe('Ana Silva');
  });

  it('empty state quando itens vazios', async () => {
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue(makePage(1, 0, 0));
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/Sem eventos no período/i)).toBeInTheDocument());
  });

  it('renderiza totalCount no header', async () => {
    render(<PrefeituraHistorico />);
    // 3 páginas * 30 = 90 no makePage
    await waitFor(() => expect(screen.getByText(/90 eventos/i)).toBeInTheDocument());
  });

  it('type badges diferenciam por tipo (checkin vs absence)', async () => {
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText('Evento 1-0')).toBeInTheDocument());
    // Badges são renderizadas com traduções — verificar quantidade
    const checkinBadges = screen.getAllByText('Check-in');
    const absenceBadges = screen.getAllByText('Ausência');
    expect(checkinBadges.length).toBeGreaterThan(0);
    expect(absenceBadges.length).toBeGreaterThan(0);
  });

  it('botão exportar chama downloadReport("history", "pdf")', async () => {
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Evento 1-0')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('history', 'pdf', expect.any(Object));
    });
  });

  it('reset da paginação ao mudar filtro (volta pra page 1)', async () => {
    // Setup: mostra page 2 primeiro
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(1, 3, 5));
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(2, 3, 5));
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePage(1, 3, 5));
    render(<PrefeituraHistorico />);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument());
    // Vai pra page 2
    await user.click(screen.getByRole('button', { name: /Próxima/i }));
    await waitFor(() => expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument());

    // Muda o filtro — deve voltar pra page 1
    const searchInput = document.getElementById('hist-search') as HTMLInputElement;
    await user.type(searchInput, 'Ana');
    await user.click(screen.getByRole('button', { name: /Aplicar/i }));

    await waitFor(() => {
      // Terceira chamada deve ter page=1
      expect(prefeituraApi.getHistory).toHaveBeenCalledTimes(3);
    });
    expect((prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mock.calls[2][4]).toBe(1);
  });

  it('error NO_ORGAN_CONTEXT mostra mensagem específica', async () => {
    (prefeituraApi.getHistory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NO_ORGAN_CONTEXT'));
    render(<PrefeituraHistorico />);
    await waitFor(() => expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument());
  });
});
