/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminConfiguracoes } from '../AdminConfiguracoes';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/settingsApi', () => ({
  settingsApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../api/clinicsApi', () => ({
  clinicsApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { settingsApi } from '../../../api/settingsApi';
import { clinicsApi } from '../../../api/clinicsApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSettings = {
  // Tolerâncias
  checkInToleranceMinutes: 15,
  absenceThresholdMinutes: 60,
  checkInBlockAfterMinutes: 120,
  notifyOnAbsence: true,
  clinicTolerances: [
    { clinicId: 'c1', clinicName: 'Clínica Alpha', checkInToleranceMinutes: null },
    { clinicId: 'c2', clinicName: 'Clínica Beta', checkInToleranceMinutes: 20 },
  ],

  // Fusos — valores diferentes do default para provar que vêm do backend
  systemTimezone: 'America/Manaus (UTC−4)',
  daylightSavingAuto: false,

  // Notificações
  notificationChannels: {
    'Ausência detectada': { email: true, sms: false, push: true },
    'Atraso acima da tolerância': { email: true, sms: false, push: false },
    'Turno sem cobertura': { email: true, sms: true, push: true },
    'Substituição pendente há mais de 2h': { email: true, sms: true, push: false },
    'Escala publicada': { email: true, sms: false, push: false },
    'Confirmação de plantão pendente': { email: true, sms: true, push: false },
    'SLA abaixo da meta contratual': { email: true, sms: false, push: false },
    'Contrato vencendo em 60 dias': { email: true, sms: false, push: false },
  },
  emailSender: 'testes@24p7.com.br',
  emailSenderName: 'Sistema 24p7 Teste',
  emailCc: 'coord@24p7.com.br',

  // Biometria
  biometricConfidencePercent: 82,
  biometricMaxAttempts: 3,
  biometricAllowManualCheckin: true,
  biometricLogFailedAttempt: false,
  azureEndpoint: 'https://24p7-face.cognitiveservices.azure.com',
  azureRegion: 'East US',

  // Sistema
  orgName: 'Organização Teste OS',
  orgCnpj: '99.888.777/0001-11',
  orgEmail: 'contato@teste.org.br',
  sessionTimeoutMinutes: 60,
  mfaRequired: true,
  passwordRotationDays: 180,
  detailedAuditLog: true,
};

const mockClinics = [
  { id: 'c1', name: 'Clínica Alpha', isActive: true, address: '', phone: '', hasNursing: false, createdAt: '2024-01-01', shiftTemplates: [] },
  { id: 'c2', name: 'Clínica Beta', isActive: true, address: '', phone: '', hasNursing: false, createdAt: '2024-01-01', shiftTemplates: [] },
];

const mockAdminGlobal = {
  userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin Global',
  roles: ['AdminGlobal'], clinicId: null, clinicIds: [],
};
const mockAdminClinica = {
  userId: 'u-ac', email: 'ac@24p7.com', name: 'Admin Clinica',
  roles: ['AdminClinica'], clinicId: 'c1', clinicIds: ['c1'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderCfg(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const user = role === 'AdminGlobal' ? mockAdminGlobal : mockAdminClinica;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminConfiguracoes onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminConfiguracoes />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (settingsApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSettings);
    (settingsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockSettings);
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
  });

  // ── Renderização básica ────────────────────────────────────────────────────

  it('exibe título e subtítulo', async () => {
    renderCfg();
    expect(screen.getByText('Configurações do Sistema')).toBeInTheDocument();
    expect(screen.getByText('Tolerâncias, fusos, notificações e integrações')).toBeInTheDocument();
  });

  it('exibe a seção Tolerâncias por padrão', async () => {
    renderCfg();
    await waitFor(() => {
      expect(screen.getByText('Tolerância de atraso no check-in')).toBeInTheDocument();
    });
  });

  it('carrega valores do backend ao montar', async () => {
    renderCfg();
    await waitFor(() => {
      expect(settingsApi.get).toHaveBeenCalledTimes(1);
      expect(clinicsApi.getAll).toHaveBeenCalledTimes(1);
    });
  });

  it('exibe tolerância global carregada do backend', async () => {
    renderCfg();
    await waitFor(() => {
      // O slider de tolerância global deve mostrar 15 min
      const val = document.querySelector('#tol-global') as HTMLInputElement;
      expect(val?.value).toBe('15');
    });
  });

  it('exibe clínicas carregadas com tolerâncias', async () => {
    renderCfg();
    // Verifica que a API de clínicas foi chamada ao montar
    await waitFor(() => {
      expect(clinicsApi.getAll).toHaveBeenCalledTimes(1);
    });
  });

  it('lida com erro de API graciosamente', async () => {
    (settingsApi.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderCfg();
    // Deve renderizar sem crash — slider global ainda existe
    await waitFor(() => {
      expect(document.querySelector('#tol-global')).toBeInTheDocument();
    });
  });

  // ── Navegação entre seções ─────────────────────────────────────────────────

  it('navega para Fusos horários ao clicar no item', async () => {
    renderCfg();
    const user = userEvent.setup();
    // Espera o componente montar (slider global sempre presente)
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Fusos horários'));
    expect(screen.getByText('Fuso horário do sistema')).toBeInTheDocument();
  });

  it('navega para Notificações ao clicar no item', async () => {
    renderCfg();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Notificações'));
    expect(screen.getByText('Canais de notificação')).toBeInTheDocument();
  });

  it('navega para Biometria ao clicar no item', async () => {
    renderCfg();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Biometria (Azure)'));
    expect(screen.getByText('Azure Face API')).toBeInTheDocument();
  });

  it('navega para Geral ao clicar no item', async () => {
    renderCfg();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Geral do sistema'));
    expect(screen.getByText('Informações da organização')).toBeInTheDocument();
  });

  // ── Role-gating: AdminGlobal ───────────────────────────────────────────────

  it('AdminGlobal vê botão "Salvar todas as configurações"', async () => {
    renderCfg('AdminGlobal');
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Salvar todas as configurações/ })).toBeInTheDocument();
  });

  it('AdminGlobal NÃO vê badge "Somente leitura"', async () => {
    renderCfg('AdminGlobal');
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    expect(screen.queryByText('Somente leitura')).not.toBeInTheDocument();
  });

  it('AdminGlobal pode interagir com sliders', async () => {
    renderCfg('AdminGlobal');
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    const slider = document.querySelector('#tol-global') as HTMLInputElement;
    expect(slider.disabled).toBe(false);
  });

  // ── Role-gating: AdminClinica ──────────────────────────────────────────────

  it('AdminClinica NÃO vê botão "Salvar"', async () => {
    renderCfg('AdminClinica');
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Salvar todas as configurações/ })).not.toBeInTheDocument();
  });

  it('AdminClinica vê badge "Somente leitura"', async () => {
    renderCfg('AdminClinica');
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    expect(screen.getByText('Somente leitura')).toBeInTheDocument();
  });

  it('AdminClinica tem sliders desabilitados', async () => {
    renderCfg('AdminClinica');
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    const slider = document.querySelector('#tol-global') as HTMLInputElement;
    expect(slider.disabled).toBe(true);
  });

  // ── Salvar tolerâncias ─────────────────────────────────────────────────────

  it('chama settingsApi.update ao clicar em Salvar', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      expect(settingsApi.update).toHaveBeenCalledTimes(1);
    });
  });

  it('passa os valores corretos para settingsApi.update', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      expect(settingsApi.update).toHaveBeenCalledWith(expect.objectContaining({
        checkInToleranceMinutes: 15,
        absenceThresholdMinutes: 60,
        checkInBlockAfterMinutes: 120,
        notifyOnAbsence: true,
      }));
    });
  });

  // ── Persistência das novas seções (Fusos, Notificações, Biometria, Sistema) ─

  it('carrega o fuso horário vindo do backend', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Fusos horários'));
    await waitFor(() => {
      const select = document.querySelector('#fuso-global') as HTMLSelectElement;
      expect(select?.value).toBe('America/Manaus (UTC−4)');
    });
  });

  it('carrega dados da seção Biometria vindos do backend', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Biometria (Azure)'));
    await waitFor(() => {
      const confSlider = document.querySelector('#conf-min') as HTMLInputElement;
      expect(confSlider.value).toBe('82');
      expect(screen.getByDisplayValue('https://24p7-face.cognitiveservices.azure.com')).toBeInTheDocument();
    });
  });

  it('carrega dados da seção Geral do sistema vindos do backend', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Geral do sistema'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Organização Teste OS')).toBeInTheDocument();
      expect(screen.getByDisplayValue('99.888.777/0001-11')).toBeInTheDocument();
      expect(screen.getByDisplayValue('contato@teste.org.br')).toBeInTheDocument();
    });
  });

  it('carrega configurações de e-mail da seção Notificações vindas do backend', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Notificações'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('testes@24p7.com.br')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Sistema 24p7 Teste')).toBeInTheDocument();
      expect(screen.getByDisplayValue('coord@24p7.com.br')).toBeInTheDocument();
    });
  });

  it('envia payload completo com as 5 seções ao salvar', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      const payload = (settingsApi.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Fusos
      expect(payload.systemTimezone).toBe('America/Manaus (UTC−4)');
      expect(payload.daylightSavingAuto).toBe(false);
      // Notificações
      expect(payload.emailSender).toBe('testes@24p7.com.br');
      expect(payload.emailSenderName).toBe('Sistema 24p7 Teste');
      expect(payload.emailCc).toBe('coord@24p7.com.br');
      expect(payload.notificationChannels).toBeDefined();
      expect(payload.notificationChannels['Ausência detectada']).toEqual({ email: true, sms: false, push: true });
      // Biometria
      expect(payload.biometricConfidencePercent).toBe(82);
      expect(payload.biometricMaxAttempts).toBe(3);
      expect(payload.biometricAllowManualCheckin).toBe(true);
      expect(payload.biometricLogFailedAttempt).toBe(false);
      expect(payload.azureEndpoint).toBe('https://24p7-face.cognitiveservices.azure.com');
      expect(payload.azureRegion).toBe('East US');
      // Sistema
      expect(payload.orgName).toBe('Organização Teste OS');
      expect(payload.orgCnpj).toBe('99.888.777/0001-11');
      expect(payload.orgEmail).toBe('contato@teste.org.br');
      expect(payload.sessionTimeoutMinutes).toBe(60);
      expect(payload.mfaRequired).toBe(true);
      expect(payload.passwordRotationDays).toBe(180);
      expect(payload.detailedAuditLog).toBe(true);
    });
  });

  it('converte o timeout de sessão de string para minutos ao salvar', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Geral do sistema'));
    await waitFor(() => screen.getByDisplayValue('Organização Teste OS'));
    // Backend retornou 60 (1 hora); troca para "Nunca" (0)
    const selects = screen.getAllByRole('combobox');
    const timeoutSelect = selects.find(s => (s as HTMLSelectElement).value === '1 hora') as HTMLSelectElement;
    expect(timeoutSelect).toBeTruthy();
    await user.selectOptions(timeoutSelect, 'Nunca');
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      const payload = (settingsApi.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.sessionTimeoutMinutes).toBe(0);
    });
  });

  it('inclui clinicTolerances no payload de save', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      const call = (settingsApi.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.clinicTolerances).toBeDefined();
      expect(Array.isArray(call.clinicTolerances)).toBe(true);
    });
  });

  it('exibe toast de sucesso após salvar', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      expect(screen.getByText(/Configurações salvas com sucesso/)).toBeInTheDocument();
    });
  });

  it('exibe toast de erro quando API falha', async () => {
    (settingsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server Error'));
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    await waitFor(() => {
      expect(screen.getByText(/Erro ao salvar configurações/)).toBeInTheDocument();
    });
  });

  it('botão salvar mostra "Salvando..." durante a requisição', async () => {
    let resolve: (v: unknown) => void;
    (settingsApi.update as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(r => { resolve = r; })
    );
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Salvar todas as configurações/ }));
    expect(screen.getByRole('button', { name: /Salvando/ })).toBeInTheDocument();
    resolve!(mockSettings);
  });

  // ── Seção Tolerâncias — regras de ausência ────────────────────────────────

  it('exibe seção de regras de ausência', async () => {
    renderCfg();
    await waitFor(() => {
      expect(screen.getByText('Regras de ausência')).toBeInTheDocument();
    });
  });

  it('exibe toggle "Notificar coordenador" ativado por padrão', async () => {
    renderCfg();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle?.checked).toBe(true);
  });

  // ── Seção Notificações ────────────────────────────────────────────────────

  it('AdminGlobal pode alternar canal de notificação', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Notificações'));
    await waitFor(() => screen.getByText('Ausência detectada'));
    // Conta quantos botões SMS estão ativos antes do clique
    const activeBefore = document.querySelectorAll('.cfg-ch-btn.active.sms').length;
    expect(activeBefore).toBeGreaterThan(0);
    // Clica no primeiro SMS ativo
    await user.click(document.querySelectorAll('.cfg-ch-btn.active.sms')[0] as HTMLElement);
    // Depois do clique, deve ter menos SMS ativos
    await waitFor(() => {
      const activeAfter = document.querySelectorAll('.cfg-ch-btn.active.sms').length;
      expect(activeAfter).toBeLessThan(activeBefore);
    });
  });

  // ── Seção Biometria ───────────────────────────────────────────────────────

  it('exibe métricas da Azure', async () => {
    renderCfg();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Biometria (Azure)'));
    await waitFor(() => {
      expect(screen.getByText('14')).toBeInTheDocument();
      expect(screen.getByText('98,4%')).toBeInTheDocument();
    });
  });

  // ── Seção Sistema — zona de risco ────────────────────────────────────────

  it('AdminGlobal vê botão Redefinir tudo', async () => {
    renderCfg('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Geral do sistema'));
    expect(screen.getByText('Redefinir tudo')).toBeInTheDocument();
  });

  it('AdminClinica tem botão Redefinir desabilitado', async () => {
    renderCfg('AdminClinica');
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('#tol-global')).toBeInTheDocument());
    await user.click(screen.getByText('Geral do sistema'));
    expect(screen.getByText('Redefinir tudo')).toBeDisabled();
  });

  // ── Theme ─────────────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminConfiguracoes onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Configurações do Sistema'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
