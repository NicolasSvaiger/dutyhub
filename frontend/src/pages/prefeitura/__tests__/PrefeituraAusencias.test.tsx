/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraAusencias } from '../PrefeituraAusencias';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getAbsences: vi.fn(),
    notifyOs: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockAbsences = [
  {
    id: 'a1', type: 'absence', userId: 'u1', userName: 'Dra. Ana Silva',
    clinicId: 'c1', clinicName: 'UPA Centro',
    date: '2026-07-15', shiftLabel: 'Noturno', minutesLate: null, justified: false,
    substituteName: null,
  },
  {
    id: 'a2', type: 'absence', userId: 'u2', userName: 'Dr. Bruno Costa',
    clinicId: 'c2', clinicName: 'UPA Norte',
    date: '2026-07-16', shiftLabel: 'Diurno', minutesLate: null, justified: false,
    substituteName: 'Dr. Carlos Faria',
  },
];

describe('<PrefeituraAusencias />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockResolvedValue(mockAbsences);
    (prefeituraApi.notifyOs as ReturnType<typeof vi.fn>).mockResolvedValue({
      alertId: 'al-1',
      createdAt: '2026-07-17T10:00:00Z',
    });
  });

  // ── Render + fetch ─────────────────────────────────────────────────

  it('chama getAbsences com type="absence" no mount', async () => {
    render(<PrefeituraAusencias />);
    await waitFor(() => expect(prefeituraApi.getAbsences).toHaveBeenCalledTimes(1));
    expect((prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe('absence');
  });

  it('renderiza tabela com userName + clinicName', async () => {
    render(<PrefeituraAusencias />);
    await waitFor(() => expect(screen.getByText('Dra. Ana Silva')).toBeInTheDocument());
    expect(screen.getByText('Dr. Bruno Costa')).toBeInTheDocument();
  });

  it('linha sem substituto mostra "Sem substituto"', async () => {
    render(<PrefeituraAusencias />);
    await waitFor(() => expect(screen.getByText('Sem substituto')).toBeInTheDocument());
  });

  it('linha com substituto mostra o nome do substituto', async () => {
    render(<PrefeituraAusencias />);
    await waitFor(() => expect(screen.getByText('Dr. Carlos Faria')).toBeInTheDocument());
  });

  it('empty state quando não há ausências', async () => {
    (prefeituraApi.getAbsences as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraAusencias />);
    await waitFor(() => expect(screen.getByText(/Sem ausências no período/i)).toBeInTheDocument());
  });

  // ── Modal notifyOs ─────────────────────────────────────────────────

  it('clicar em "Acionar OS" abre modal com role="dialog"', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Acionar Operação de Serviço/i)).toBeInTheDocument();
  });

  it('modal mostra nome do profissional e clínica no confirm', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    // Confirm text has userName + clinicName + date
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Dra\. Ana Silva/);
    expect(dialog.textContent).toMatch(/UPA Centro/);
  });

  it('modal tem textarea de mensagem opcional', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    const textarea = screen.getByRole('textbox', { name: /Mensagem opcional/i });
    expect(textarea).toBeInTheDocument();
  });

  it('cancelar fecha o modal sem chamar notifyOs', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(prefeituraApi.notifyOs).not.toHaveBeenCalled();
  });

  it('confirmar chama notifyOs com id, userId e message', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    const textarea = screen.getByRole('textbox', { name: /Mensagem opcional/i });
    await user.type(textarea, 'Sem contato há 2h');
    await user.click(screen.getByRole('button', { name: /Confirmar acionamento/i }));

    await waitFor(() => {
      expect(prefeituraApi.notifyOs).toHaveBeenCalledWith('a1', 'u1', 'Sem contato há 2h');
    });
  });

  it('confirmar sem mensagem passa undefined', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    await user.click(screen.getByRole('button', { name: /Confirmar acionamento/i }));

    await waitFor(() => {
      expect(prefeituraApi.notifyOs).toHaveBeenCalledWith('a1', 'u1', undefined);
    });
  });

  it('após sucesso mostra toast e botão vira "Notificado" desabilitado', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    await user.click(screen.getByRole('button', { name: /Confirmar acionamento/i }));

    // Toast aparece
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/OS acionada com sucesso para Dra\. Ana Silva/i);
    });
    // Modal fecha
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Botão substituído por "Notificado"
    expect(screen.getByText('Notificado')).toBeInTheDocument();
    // Ainda tem 1 botão "Acionar OS" (da 2ª linha)
    expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(1);
  });

  it('após erro mostra modalError e mantém modal aberto', async () => {
    (prefeituraApi.notifyOs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha rede'));
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    await user.click(screen.getByRole('button', { name: /Confirmar acionamento/i }));

    await waitFor(() => {
      expect(screen.getByText('Falha rede')).toBeInTheDocument();
    });
    // Modal ainda está aberto
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // notifyOs foi chamado
    expect(prefeituraApi.notifyOs).toHaveBeenCalledTimes(1);
  });

  it('clicar no overlay fora do modal fecha', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    const dialog = screen.getByRole('dialog');
    // Click direto no overlay (o dialog é o próprio overlay wrapper com onClick=close)
    await user.click(dialog);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicar dentro do modal body NÃO fecha (stopPropagation)', async () => {
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Acionar OS/i }).length).toBe(2));

    await user.click(screen.getAllByRole('button', { name: /Acionar OS/i })[0]);
    // Click no título do modal
    await user.click(screen.getByText(/Acionar Operação de Serviço/i));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('botão exportar Excel chama downloadReport("ausencias", "xlsx")', async () => {
    (prefeituraApi.downloadReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    render(<PrefeituraAusencias />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Dra. Ana Silva')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Exportar Excel/i }));

    await waitFor(() => {
      expect(prefeituraApi.downloadReport).toHaveBeenCalledWith('ausencias', 'xlsx', expect.any(Object));
    });
  });
});
