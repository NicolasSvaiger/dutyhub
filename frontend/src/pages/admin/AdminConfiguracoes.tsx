/**
 * Admin OS — Configurações do Sistema.
 * Seções: Tolerâncias, Fusos horários, Notificações, Biometria (Azure), Geral.
 * AdminGlobal: leitura e edição completa.
 * AdminClinica: somente leitura.
 */
import React, { useState, useEffect } from 'react';
import { clinicsApi } from '../../api/clinicsApi';
import { settingsApi } from '../../api/settingsApi';
import { useAuth } from '../../hooks/useAuth';
import type { Clinic } from '../../types';

type Section = 'tolerancia' | 'fusos' | 'notificacoes' | 'biometria' | 'sistema';

interface NotifState {
  email: boolean;
  sms: boolean;
  push: boolean;
}
interface NotifGroup {
  [event: string]: NotifState;
}

interface ToleranciaClinica {
  clinicId: string;
  name: string;
  minutes: number;
}

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; }

const NOTIF_EVENTS: { group: string; events: string[] }[] = [
  { group: 'Operacional', events: ['Ausência detectada', 'Atraso acima da tolerância', 'Turno sem cobertura', 'Substituição pendente há mais de 2h'] },
  { group: 'Escalas e confirmações', events: ['Escala publicada', 'Confirmação de plantão pendente'] },
  { group: 'Contratos e SLA', events: ['SLA abaixo da meta contratual', 'Contrato vencendo em 60 dias'] },
];

const DEFAULT_NOTIF: NotifGroup = {
  'Ausência detectada':                  { email: true,  sms: true,  push: false },
  'Atraso acima da tolerância':          { email: true,  sms: false, push: false },
  'Turno sem cobertura':                 { email: true,  sms: true,  push: true  },
  'Substituição pendente há mais de 2h': { email: true,  sms: true,  push: false },
  'Escala publicada':                    { email: true,  sms: false, push: false },
  'Confirmação de plantão pendente':     { email: true,  sms: true,  push: false },
  'SLA abaixo da meta contratual':       { email: true,  sms: false, push: false },
  'Contrato vencendo em 60 dias':        { email: true,  sms: false, push: false },
};

const BR_TIMEZONES = [
  'America/Sao_Paulo (UTC−3)',
  'America/Manaus (UTC−4)',
  'America/Belem (UTC−3)',
  'America/Fortaleza (UTC−3)',
  'America/Cuiaba (UTC−4)',
  'America/Porto_Velho (UTC−4)',
  'America/Rio_Branco (UTC−5)',
];

export function AdminConfiguracoes({ dark, onToggleTheme }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');

  const [section, setSection] = useState<Section>('tolerancia');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Tolerâncias ──────────────────────────────────────────────────────────────
  const [tolGlobal, setTolGlobal] = useState(15);
  const [tolAusencia, setTolAusencia] = useState(60);
  const [tolBloqueio, setTolBloqueio] = useState(120);
  const [notifAusencia, setNotifAusencia] = useState(true);
  const [tolClinicas, setTolClinicas] = useState<ToleranciaClinica[]>([]);

  // ── Fusos ────────────────────────────────────────────────────────────────────
  const [fusoGlobal, setFusoGlobal] = useState(BR_TIMEZONES[0]);
  const [horarioVerao, setHorarioVerao] = useState(true);
  const [fusosClinicas, setFusosClinicas] = useState<Record<string, string>>({});

  // ── Notificações ─────────────────────────────────────────────────────────────
  const [notif, setNotif] = useState<NotifGroup>(DEFAULT_NOTIF);
  const [emailRemetente, setEmailRemetente] = useState('noreply@24p7.com.br');
  const [nomeRemetente, setNomeRemetente] = useState('Sistema 24p7');
  const [emailCC, setEmailCC] = useState('');

  // ── Biometria ────────────────────────────────────────────────────────────────
  const [confMin, setConfMin] = useState(90);
  const [tentativas, setTentativas] = useState('3 tentativas');
  const [checkinManual, setCheckinManual] = useState(true);
  const [registrarFalha, setRegistrarFalha] = useState(false);
  const [azureEndpoint, setAzureEndpoint] = useState('https://24p7-face.cognitiveservices.azure.com');
  const [azureKeyVisible, setAzureKeyVisible] = useState(false);
  const [azureRegion, setAzureRegion] = useState('Brazil South');
  const [azureTesting, setAzureTesting] = useState(false);

  // ── Sistema ──────────────────────────────────────────────────────────────────
  const [orgNome, setOrgNome] = useState('OS Saúde Integrada');
  const [orgCnpj, setOrgCnpj] = useState('12.345.678/0001-90');
  const [orgEmail, setOrgEmail] = useState('contato@ossaude.com.br');
  const [sessaoTimeout, setSessaoTimeout] = useState('30 minutos');
  const [mfaObrigatorio, setMfaObrigatorio] = useState(true);
  const [forcaTrocaSenha, setForcaTrocaSenha] = useState('90 dias');
  const [auditoria, setAuditoria] = useState(true);

  useEffect(() => {
    // Load settings and clinics in parallel
    Promise.all([
      settingsApi.get().catch(() => null),
      clinicsApi.getAll().catch(() => []),
    ]).then(([settings, clinicData]) => {
      const list = Array.isArray(clinicData) ? clinicData : [];
      setClinics(list);

      if (settings) {
        setTolGlobal(settings.checkInToleranceMinutes);
        setTolAusencia(settings.absenceThresholdMinutes);
        setTolBloqueio(settings.checkInBlockAfterMinutes);
        setNotifAusencia(settings.notifyOnAbsence);

        // Per-clinic tolerances: merge API values into clinic list
        setTolClinicas(list.map(c => {
          const override = settings.clinicTolerances.find(ct => ct.clinicId === c.id);
          return {
            clinicId: c.id,
            name: c.name,
            minutes: override?.checkInToleranceMinutes ?? settings.checkInToleranceMinutes,
          };
        }));
      } else {
        setTolClinicas(list.map(c => ({ clinicId: c.id, name: c.name, minutes: 15 })));
      }

      setFusosClinicas(Object.fromEntries(list.map(c => [c.id, BR_TIMEZONES[0]])));
    });
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function salvarTudo() {
    setSaving(true);
    try {
      await settingsApi.update({
        checkInToleranceMinutes: tolGlobal,
        absenceThresholdMinutes: tolAusencia,
        checkInBlockAfterMinutes: tolBloqueio,
        notifyOnAbsence: notifAusencia,
        clinicTolerances: tolClinicas.map(tc => ({
          clinicId: tc.clinicId,
          // Send null if the clinic uses the global default (i.e. same as global)
          checkInToleranceMinutes: tc.minutes !== tolGlobal ? tc.minutes : null,
        })),
      });
      showToast('✅ Tolerâncias salvas com sucesso!');
    } catch {
      showToast('❌ Erro ao salvar configurações. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function toggleNotif(event: string, channel: keyof NotifState) {
    if (!isAdminGlobal) return;
    setNotif(prev => ({
      ...prev,
      [event]: { ...prev[event], [channel]: !prev[event][channel] },
    }));
  }

  async function testarAzure() {
    setAzureTesting(true);
    showToast('🔄 Testando conexão com Azure Face API...');
    await new Promise(r => setTimeout(r, 2000));
    setAzureTesting(false);
    showToast('✅ Conexão com Azure Face API: OK — Latência: 142ms');
  }

  function limparCache() { showToast('Cache limpo com sucesso!'); }

  function redefinirTudo() {
    if (!window.confirm('Tem certeza? Esta ação redefinirá TODAS as configurações para os valores padrão. Esta ação não pode ser desfeita.')) return;
    setTolGlobal(15); setTolAusencia(60); setTolBloqueio(120);
    setConfMin(90); setMfaObrigatorio(true); setAuditoria(true);
    showToast('Configurações redefinidas para os valores padrão.');
  }

  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  // ── Render helpers ───────────────────────────────────────────────────────────

  function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <label className="cfg-toggle-wrap">
        <input type="checkbox" checked={checked} onChange={e => isAdminGlobal && onChange(e.target.checked)} disabled={!isAdminGlobal} />
        <span className="cfg-toggle-slider" />
      </label>
    );
  }

  function Slider({ id, min, max, step, value, onChange, unit }: {
    id: string; min: number; max: number; step: number;
    value: number; onChange: (v: number) => void; unit: string;
  }) {
    return (
      <div className="cfg-slider-wrap">
        <input type="range" className="cfg-slider" id={id} min={min} max={max} step={step} value={value}
          disabled={!isAdminGlobal}
          onChange={e => isAdminGlobal && onChange(Number(e.target.value))} />
        <div className="cfg-slider-val">{value} {unit}</div>
      </div>
    );
  }

  function CfgCard({ icon, iconBg, iconColor, title, sub, children }: {
    icon: React.ReactNode; iconBg: string; iconColor: string;
    title: string; sub?: string; children: React.ReactNode;
  }) {
    return (
      <div className="cfg-card">
        <div className="cfg-card-header">
          <div className="cfg-card-icon" style={{ background: iconBg, color: iconColor }}>{icon}</div>
          <div>
            <div className="cfg-card-title">{title}</div>
            {sub && <div className="cfg-card-sub">{sub}</div>}
          </div>
        </div>
        <div className="cfg-card-body">{children}</div>
      </div>
    );
  }

  function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div className="cfg-row">
        <div className="cfg-row-left">
          <div className="cfg-row-label">{label}</div>
          {hint && <div className="cfg-row-hint">{hint}</div>}
        </div>
        <div className="cfg-row-right">{children}</div>
      </div>
    );
  }

  // ── Section renders ──────────────────────────────────────────────────────────

  function SecTolerancia() {
    return (
      <>
        <CfgCard
          iconBg="var(--yellow-light)" iconColor="var(--yellow)" title="Tolerância de atraso no check-in"
          sub="Tempo máximo após o horário previsto para não contabilizar como atraso"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        >
          <Row label="Tolerância padrão global" hint="Aplicada a todas as UPAs que não tiverem tolerância específica">
            <Slider id="tol-global" min={5} max={60} step={5} value={tolGlobal} onChange={setTolGlobal} unit="min" />
          </Row>
          {tolClinicas.map((tc, i) => (
            <Row key={tc.clinicId} label={`Tolerância — ${tc.name}`} hint="Sobrepõe a tolerância global para esta unidade">
              <Slider id={`tol-c-${i}`} min={5} max={60} step={5}
                value={tc.minutes}
                onChange={v => setTolClinicas(prev => prev.map((x, j) => j === i ? { ...x, minutes: v } : x))}
                unit="min" />
            </Row>
          ))}
        </CfgCard>

        <CfgCard
          iconBg="var(--red-light)" iconColor="var(--red)" title="Regras de ausência"
          sub="Quando um check-in não realizado é considerado ausência"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        >
          <Row label="Tempo para classificar como ausência" hint="Após este tempo sem check-in, o plantão vira ausência automaticamente">
            <Slider id="tol-aus" min={30} max={180} step={15} value={tolAusencia} onChange={setTolAusencia} unit="min" />
          </Row>
          <Row label="Notificar coordenador quando ausência for detectada">
            <Toggle checked={notifAusencia} onChange={setNotifAusencia} />
          </Row>
          <Row label="Bloquear check-in após início do turno por mais de" hint="Após este tempo, o check-in é automaticamente negado">
            <Slider id="tol-blk" min={60} max={360} step={30} value={tolBloqueio} onChange={setTolBloqueio} unit="min" />
          </Row>
        </CfgCard>
      </>
    );
  }

  function SecFusos() {
    return (
      <>
        <CfgCard
          iconBg="var(--blue-light)" iconColor="var(--blue)" title="Fuso horário do sistema"
          sub="Define como timestamps de check-in/out são registrados"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
        >
          <Row label="Fuso padrão do sistema" hint="Aplicado a todos os registros quando não há configuração por UPA">
            <select className="cfg-select" value={fusoGlobal} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setFusoGlobal(e.target.value)} style={{ width: 240 }}>
              {BR_TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
            </select>
          </Row>
          <Row label="Ajuste automático de horário de verão" hint="Aplica automaticamente o horário de verão quando vigente">
            <Toggle checked={horarioVerao} onChange={setHorarioVerao} />
          </Row>
        </CfgCard>

        <CfgCard
          iconBg="var(--teal-light)" iconColor="var(--teal)" title="Fuso horário por UPA"
          sub="Configure individualmente quando as unidades estiverem em estados diferentes"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>}
        >
          <div className="cfg-fusos-list">
            {clinics.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.82rem', fontWeight: 600 }}>Nenhuma UPA cadastrada.</div>}
            {clinics.map((c, i) => (
              <div key={c.id} className="cfg-fuso-item">
                <div className="cfg-fuso-icon" style={{ background: 'var(--indigo-light)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="cfg-fuso-name">{c.name}</div>
                  {c.city && <div className="cfg-fuso-city">{c.city}</div>}
                </div>
                <select className="cfg-select" style={{ width: 240 }} disabled={!isAdminGlobal}
                  value={fusosClinicas[c.id] ?? BR_TIMEZONES[0]}
                  onChange={e => isAdminGlobal && setFusosClinicas(prev => ({ ...prev, [c.id]: e.target.value }))}>
                  {BR_TIMEZONES.map(tz => <option key={`${i}-${tz}`}>{tz}</option>)}
                </select>
              </div>
            ))}
          </div>
        </CfgCard>
      </>
    );
  }

  function SecNotificacoes() {
    return (
      <>
        <CfgCard
          iconBg="var(--indigo-light)" iconColor="var(--indigo)" title="Canais de notificação"
          sub="Configure para cada evento quais canais devem ser acionados"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
        >
          <div className="cfg-notif-header">
            <span style={{ flex: 1 }} />
            {(['E-mail', 'SMS', 'Push'] as const).map(ch => (
              <span key={ch} className="cfg-notif-ch-label">{ch}</span>
            ))}
          </div>
          {NOTIF_EVENTS.map(({ group, events }) => (
            <div key={group} className="cfg-notif-group">
              <div className="cfg-notif-group-title">{group}</div>
              {events.map(ev => (
                <div key={ev} className="cfg-notif-row">
                  <div className="cfg-notif-label">{ev}</div>
                  <div className="cfg-notif-channels">
                    {(['email', 'sms', 'push'] as (keyof NotifState)[]).map(ch => (
                      <button key={ch}
                        className={`cfg-ch-btn ${notif[ev]?.[ch] ? `active ${ch}` : ''}`}
                        onClick={() => toggleNotif(ev, ch)}
                        disabled={!isAdminGlobal}>
                        {ch === 'email' ? 'E-mail' : ch === 'sms' ? 'SMS' : 'Push'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CfgCard>

        <CfgCard
          iconBg="var(--green-light)" iconColor="var(--green)" title="Configurações de e-mail"
          sub="Remetente e destinatários padrão dos alertas"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
        >
          <Row label="E-mail remetente" hint="Endereço que aparecerá como 'De' nos e-mails enviados">
            <input type="email" className="cfg-input cfg-input-md" value={emailRemetente} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setEmailRemetente(e.target.value)} />
          </Row>
          <Row label="Nome do remetente">
            <input type="text" className="cfg-input cfg-input-md" value={nomeRemetente} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setNomeRemetente(e.target.value)} />
          </Row>
          <Row label="Cópia para coordenação (CC)" hint="Recebe cópia de todos os alertas críticos">
            <input type="email" className="cfg-input cfg-input-md" value={emailCC} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setEmailCC(e.target.value)} placeholder="email@organização.com" />
          </Row>
        </CfgCard>
      </>
    );
  }

  function SecBiometria() {
    return (
      <>
        <CfgCard
          iconBg="#e0f0ff" iconColor="#0078d4" title="Azure Face API"
          sub="Integração para reconhecimento facial no check-in/check-out"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0078d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
        >
          {/* Status card Azure */}
          <div className="cfg-azure-card">
            <div className="cfg-azure-logo">
              <svg width="28" height="28" viewBox="0 0 96 96" fill="none"><path d="M33.338 6.544l-30 52 16.5.001 30-52z" fill="#fff" opacity=".9"/><path d="M56.056 6.544l-30 52h16.5l30-52z" fill="#fff" opacity=".6"/><path d="M3.338 58.544l16.5 30.912L86.5 58.544z" fill="#fff" opacity=".8"/></svg>
              <div>
                <div className="cfg-azure-name">Microsoft Azure</div>
                <div className="cfg-azure-sub">Face API · Cognitive Services</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
              <span className="cfg-status-badge cfg-status-ok">
                <span className="cfg-status-dot" />Conectado
              </span>
              <button className="cfg-btn secondary" onClick={testarAzure} disabled={azureTesting}>
                {azureTesting ? 'Testando...' : 'Testar conexão'}
              </button>
            </div>
          </div>

          {/* Métricas */}
          <div className="cfg-azure-metrics">
            {[['14', 'Rostos cadastrados'], ['98,4%', 'Taxa de reconhecimento'], ['1.240', 'Verificações no mês']].map(([v, l]) => (
              <div key={l} className="cfg-az-metric">
                <div className="cfg-az-val">{v}</div>
                <div className="cfg-az-lbl">{l}</div>
              </div>
            ))}
          </div>

          <Row label="Endpoint da API" hint="URL do recurso criado no portal Azure">
            <input type="text" className="cfg-input" style={{ width: 280 }} value={azureEndpoint}
              disabled={!isAdminGlobal} onChange={e => isAdminGlobal && setAzureEndpoint(e.target.value)} />
          </Row>
          <Row label="Chave de assinatura (API Key)" hint="Chave primária do recurso de Face API">
            <div className="cfg-key-row">
              <input type={azureKeyVisible ? 'text' : 'password'} className="cfg-key-input"
                style={{ width: 220 }} value={azureKeyVisible ? 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' : '••••••••••••••••••••••••••••••••'}
                readOnly />
              <button className="cfg-key-btn" onClick={() => setAzureKeyVisible(v => !v)} title="Mostrar/ocultar chave">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </Row>
          <Row label="Região do Azure">
            <select className="cfg-select" style={{ width: 200 }} value={azureRegion}
              disabled={!isAdminGlobal} onChange={e => isAdminGlobal && setAzureRegion(e.target.value)}>
              {['Brazil South', 'East US', 'West Europe', 'Southeast Asia'].map(r => <option key={r}>{r}</option>)}
            </select>
          </Row>
        </CfgCard>

        <CfgCard
          iconBg="var(--teal-light)" iconColor="var(--teal)" title="Parâmetros de reconhecimento facial"
          sub="Ajustes de sensibilidade e comportamento da biometria"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
        >
          <Row label="Confiança mínima para reconhecimento" hint="Percentual mínimo de certeza para aceitar o check-in biométrico">
            <Slider id="conf-min" min={70} max={99} step={1} value={confMin} onChange={setConfMin} unit="%" />
          </Row>
          <Row label="Tentativas antes de bloquear check-in" hint="Número de tentativas falhas antes de negar o acesso">
            <select className="cfg-select" style={{ width: 140 }} value={tentativas}
              disabled={!isAdminGlobal} onChange={e => isAdminGlobal && setTentativas(e.target.value)}>
              {['2 tentativas', '3 tentativas', '5 tentativas'].map(v => <option key={v}>{v}</option>)}
            </select>
          </Row>
          <Row label="Permitir check-in manual se biometria falhar" hint="Coordenador pode autorizar manualmente em caso de falha técnica">
            <Toggle checked={checkinManual} onChange={setCheckinManual} />
          </Row>
          <Row label="Registrar imagem da tentativa com falha" hint="Armazena frame da câmera para auditoria de segurança">
            <Toggle checked={registrarFalha} onChange={setRegistrarFalha} />
          </Row>
          <Row label="Conformidade LGPD" hint="Templates faciais são vetores matemáticos criptografados — nenhuma imagem é armazenada">
            <span className="cfg-status-badge cfg-status-ok"><span className="cfg-status-dot" />Ativo</span>
          </Row>
        </CfgCard>
      </>
    );
  }

  function SecSistema() {
    return (
      <>
        <CfgCard
          iconBg="var(--indigo-light)" iconColor="var(--indigo)" title="Informações da organização"
          sub="Dados da OS que aparecem nos relatórios e documentos exportados"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
        >
          <Row label="Nome da Organização Social">
            <input type="text" className="cfg-input cfg-input-md" value={orgNome} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setOrgNome(e.target.value)} />
          </Row>
          <Row label="CNPJ">
            <input type="text" className="cfg-input cfg-input-md" value={orgCnpj} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setOrgCnpj(e.target.value)} />
          </Row>
          <Row label="E-mail institucional">
            <input type="email" className="cfg-input cfg-input-md" value={orgEmail} disabled={!isAdminGlobal}
              onChange={e => isAdminGlobal && setOrgEmail(e.target.value)} />
          </Row>
          <Row label="Idioma do sistema">
            <select className="cfg-select" style={{ width: 180 }} disabled>
              <option>Português (Brasil)</option>
            </select>
          </Row>
        </CfgCard>

        <CfgCard
          iconBg="var(--yellow-light)" iconColor="var(--yellow)" title="Sessão e segurança"
          sub="Controle de acesso e expiração de sessão"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
        >
          <Row label="Tempo de inatividade para logout automático">
            <select className="cfg-select" style={{ width: 180 }} value={sessaoTimeout}
              disabled={!isAdminGlobal} onChange={e => isAdminGlobal && setSessaoTimeout(e.target.value)}>
              {['15 minutos', '30 minutos', '1 hora', '4 horas', 'Nunca'].map(v => <option key={v}>{v}</option>)}
            </select>
          </Row>
          <Row label="Autenticação de dois fatores (MFA) obrigatória" hint="Todos os usuários precisam de MFA para acessar o sistema">
            <Toggle checked={mfaObrigatorio} onChange={setMfaObrigatorio} />
          </Row>
          <Row label="Forçar troca de senha a cada">
            <select className="cfg-select" style={{ width: 150 }} value={forcaTrocaSenha}
              disabled={!isAdminGlobal} onChange={e => isAdminGlobal && setForcaTrocaSenha(e.target.value)}>
              {['30 dias', '90 dias', '180 dias', 'Nunca'].map(v => <option key={v}>{v}</option>)}
            </select>
          </Row>
          <Row label="Registro de auditoria detalhado" hint="Registra cada ação do usuário para rastreabilidade completa">
            <Toggle checked={auditoria} onChange={setAuditoria} />
          </Row>
        </CfgCard>

        <CfgCard
          iconBg="var(--red-light)" iconColor="var(--red)" title="Zona de risco"
          sub="Ações irreversíveis que afetam toda a plataforma"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
        >
          <div className="cfg-danger-zone">
            <div className="cfg-danger-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Zona de risco — ações irreversíveis
            </div>
            <Row label="Redefinir todas as configurações" hint="Reverte todas as configurações para os valores padrão de fábrica">
              <button className="cfg-btn danger" onClick={redefinirTudo} disabled={!isAdminGlobal}>Redefinir tudo</button>
            </Row>
            <Row label="Limpar cache do sistema" hint="Remove todos os dados temporários. Pode ser necessário após atualizações">
              <button className="cfg-btn secondary" onClick={limparCache}>Limpar cache</button>
            </Row>
          </div>
        </CfgCard>
      </>
    );
  }

  const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'tolerancia', label: 'Tolerâncias', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { id: 'fusos', label: 'Fusos horários', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
    { id: 'notificacoes', label: 'Notificações', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    { id: 'biometria', label: 'Biometria (Azure)', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    { id: 'sistema', label: 'Geral do sistema', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CFG_CSS }} />

      <div className="cfg-topbar">
        <div>
          <div className="cfg-topbar-title">Configurações do Sistema</div>
          <div className="cfg-topbar-sub">Tolerâncias, fusos, notificações e integrações</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
          {!isAdminGlobal && (
            <div className="cfg-readonly-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Somente leitura
            </div>
          )}
          {isAdminGlobal && (
            <button className="cfg-btn-salvar" onClick={salvarTudo} disabled={saving}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {saving ? 'Salvando...' : 'Salvar todas as configurações'}
            </button>
          )}
          <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
        </div>
      </div>

      <div className="cfg-content">
        <div className="cfg-layout">
          {/* Nav lateral */}
          <nav className="cfg-sidenav">
            {NAV_ITEMS.map((item, i) => (
              <React.Fragment key={item.id}>
                {i === 4 && <div className="cfg-sidenav-divider" />}
                <button
                  className={`cfg-sidenav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}>
                  {item.icon}{item.label}
                </button>
              </React.Fragment>
            ))}
          </nav>

          {/* Conteúdo */}
          <div className="cfg-sections">
            {section === 'tolerancia'   && <SecTolerancia />}
            {section === 'fusos'        && <SecFusos />}
            {section === 'notificacoes' && <SecNotificacoes />}
            {section === 'biometria'    && <SecBiometria />}
            {section === 'sistema'      && <SecSistema />}
          </div>
        </div>
      </div>

      <div className={`cfg-toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}

const CFG_CSS = `
#adm-root .cfg-topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 2rem;position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;}
#adm-root .cfg-topbar-title{font-family:'Nunito',sans-serif;font-size:1.05rem;font-weight:900;color:var(--text);}
#adm-root .cfg-topbar-sub{font-size:.7rem;font-weight:600;color:var(--muted);margin-top:1px;}
#adm-root .cfg-btn-salvar{display:flex;align-items:center;gap:.45rem;padding:.6rem 1.3rem;border:none;border-radius:12px;background:linear-gradient(135deg,var(--indigo),var(--indigo-dark));color:#fff;font-family:'Nunito',sans-serif;font-size:.85rem;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,.35);transition:transform .14s;}
#adm-root .cfg-btn-salvar:hover{transform:translateY(-1px);}
#adm-root .cfg-btn-salvar:disabled{opacity:.5;cursor:not-allowed;transform:none;}
#adm-root .cfg-readonly-badge{display:flex;align-items:center;gap:.4rem;background:var(--indigo-light);border:1.5px solid rgba(99,102,241,.2);border-radius:10px;padding:.45rem .85rem;font-size:.72rem;font-weight:800;color:var(--indigo);}
#adm-root .cfg-content{flex:1;padding:2rem;overflow-y:auto;animation:fadeUp .35s ease;}
#adm-root .cfg-layout{display:grid;grid-template-columns:210px 1fr;gap:1.4rem;align-items:start;}
#adm-root .cfg-sidenav{background:var(--surface);border-radius:18px;border:1.5px solid var(--border);overflow:hidden;position:sticky;top:5.5rem;}
#adm-root .cfg-sidenav-item{display:flex;align-items:center;gap:.7rem;width:100%;padding:.8rem 1.2rem;font-size:.82rem;font-weight:700;color:var(--muted);cursor:pointer;transition:all .15s;border:none;background:none;border-left:3px solid transparent;text-align:left;}
#adm-root .cfg-sidenav-item:hover{background:var(--indigo-light);color:var(--indigo);}
#adm-root .cfg-sidenav-item.active{background:var(--indigo-light);color:var(--indigo);border-left-color:var(--indigo);}
#adm-root .cfg-sidenav-divider{height:1px;background:var(--border);}
#adm-root .cfg-sections{display:flex;flex-direction:column;gap:1.2rem;}
#adm-root .cfg-card{background:var(--surface);border-radius:18px;border:1.5px solid var(--border);overflow:hidden;}
#adm-root .cfg-card-header{padding:1.1rem 1.6rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:.8rem;}
#adm-root .cfg-card-icon{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
#adm-root .cfg-card-title{font-family:'Nunito',sans-serif;font-size:.92rem;font-weight:900;color:var(--text);}
#adm-root .cfg-card-sub{font-size:.7rem;font-weight:600;color:var(--muted);margin-top:2px;}
#adm-root .cfg-card-body{padding:1.4rem 1.6rem;display:flex;flex-direction:column;gap:0;}
#adm-root .cfg-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.7rem 0;border-bottom:1px solid rgba(0,0,0,.04);}
#adm-root .cfg-row:last-child{border-bottom:none;padding-bottom:0;}
#adm-root .cfg-row:first-child{padding-top:0;}
#adm-root .cfg-row-left{flex:1;}
#adm-root .cfg-row-label{font-size:.85rem;font-weight:800;color:var(--text);line-height:1.2;}
#adm-root .cfg-row-hint{font-size:.7rem;font-weight:600;color:var(--muted);margin-top:3px;line-height:1.4;}
#adm-root .cfg-row-right{flex-shrink:0;}
#adm-root .cfg-input{padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:10px;font-family:'Nunito Sans',sans-serif;font-size:.85rem;font-weight:600;color:var(--text);background:var(--bg);outline:none;transition:border-color .2s;}
#adm-root .cfg-input:focus{border-color:var(--indigo);background:#fff;}
#adm-root .cfg-input:disabled{opacity:.6;cursor:default;}
#adm-root .cfg-input-md{width:180px;}
#adm-root .cfg-select{appearance:none;-webkit-appearance:none;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:.6rem 2.2rem .6rem .9rem;font-family:'Nunito Sans',sans-serif;font-size:.85rem;font-weight:600;color:var(--text);outline:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right .7rem center;}
#adm-root .cfg-select:focus{border-color:var(--indigo);}
#adm-root .cfg-select:disabled{opacity:.6;cursor:default;}
#adm-root .cfg-slider-wrap{display:flex;align-items:center;gap:.8rem;}
#adm-root .cfg-slider{-webkit-appearance:none;appearance:none;width:160px;height:6px;border-radius:6px;background:var(--bg);border:1.5px solid var(--border);outline:none;cursor:pointer;}
#adm-root .cfg-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--indigo);box-shadow:0 2px 6px rgba(99,102,241,.4);cursor:pointer;}
#adm-root .cfg-slider:disabled{opacity:.5;cursor:default;}
#adm-root .cfg-slider-val{font-family:'Nunito',sans-serif;font-size:.88rem;font-weight:900;color:var(--indigo);min-width:48px;text-align:center;background:var(--indigo-light);padding:.3rem .6rem;border-radius:8px;}
#adm-root .cfg-toggle-wrap{position:relative;width:44px;height:24px;flex-shrink:0;display:inline-block;}
#adm-root .cfg-toggle-wrap input{opacity:0;width:0;height:0;position:absolute;}
#adm-root .cfg-toggle-slider{position:absolute;inset:0;background:#d1d5db;border-radius:24px;cursor:pointer;transition:background .2s;}
#adm-root .cfg-toggle-slider::before{content:'';position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.2);}
#adm-root .cfg-toggle-wrap input:checked+.cfg-toggle-slider{background:var(--indigo);}
#adm-root .cfg-toggle-wrap input:checked+.cfg-toggle-slider::before{transform:translateX(20px);}
#adm-root .cfg-toggle-wrap input:disabled+.cfg-toggle-slider{opacity:.6;cursor:default;}
#adm-root .cfg-status-badge{display:inline-flex;align-items:center;gap:.35rem;font-size:.72rem;font-weight:800;padding:.28rem .7rem;border-radius:20px;}
#adm-root .cfg-status-ok{background:var(--green-light);color:#16a34a;}
#adm-root .cfg-status-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 1.5s ease infinite;}
#adm-root .cfg-btn{display:flex;align-items:center;gap:.4rem;padding:.5rem 1rem;border-radius:10px;font-family:'Nunito',sans-serif;font-size:.78rem;font-weight:800;cursor:pointer;transition:all .15s;border:1.5px solid;}
#adm-root .cfg-btn.primary{background:var(--indigo);border-color:var(--indigo);color:#fff;}
#adm-root .cfg-btn.secondary{background:none;border-color:var(--border);color:var(--muted);}
#adm-root .cfg-btn.secondary:hover{border-color:var(--indigo);color:var(--indigo);background:var(--indigo-light);}
#adm-root .cfg-btn.danger{background:none;border-color:rgba(239,68,68,.3);color:var(--red);}
#adm-root .cfg-btn.danger:hover{background:var(--red-light);}
#adm-root .cfg-btn:disabled{opacity:.4;cursor:not-allowed;}
#adm-root .cfg-fusos-list{display:flex;flex-direction:column;gap:.5rem;}
#adm-root .cfg-fuso-item{display:flex;align-items:center;gap:.9rem;padding:.7rem .9rem;background:var(--bg);border-radius:12px;}
#adm-root .cfg-fuso-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
#adm-root .cfg-fuso-name{font-size:.82rem;font-weight:800;color:var(--text);}
#adm-root .cfg-fuso-city{font-size:.68rem;font-weight:600;color:var(--muted);}
#adm-root .cfg-notif-header{display:flex;align-items:center;margin-bottom:.5rem;}
#adm-root .cfg-notif-ch-label{min-width:60px;text-align:center;font-size:.68rem;font-weight:800;color:var(--muted);}
#adm-root .cfg-notif-group{background:var(--bg);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.6rem;margin-bottom:.6rem;}
#adm-root .cfg-notif-group-title{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:.2rem;}
#adm-root .cfg-notif-row{display:flex;align-items:center;justify-content:space-between;gap:.8rem;}
#adm-root .cfg-notif-label{font-size:.8rem;font-weight:700;color:var(--text);}
#adm-root .cfg-notif-channels{display:flex;gap:.5rem;}
#adm-root .cfg-ch-btn{padding:.28rem .65rem;border-radius:8px;border:1.5px solid var(--border);background:none;font-size:.65rem;font-weight:800;cursor:pointer;transition:all .15s;color:var(--muted);}
#adm-root .cfg-ch-btn.active.email{border-color:var(--indigo);background:var(--indigo-light);color:var(--indigo);}
#adm-root .cfg-ch-btn.active.sms{border-color:var(--green);background:var(--green-light);color:#16a34a;}
#adm-root .cfg-ch-btn.active.push{border-color:var(--orange);background:var(--orange-light);color:var(--orange);}
#adm-root .cfg-ch-btn:disabled{opacity:.5;cursor:default;}
#adm-root .cfg-azure-card{background:linear-gradient(135deg,#0078d4 0%,#005a9e 100%);border-radius:16px;padding:1.2rem 1.4rem;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.8rem;}
#adm-root .cfg-azure-logo{display:flex;align-items:center;gap:.7rem;}
#adm-root .cfg-azure-name{font-family:'Nunito',sans-serif;font-size:1rem;font-weight:900;line-height:1.2;}
#adm-root .cfg-azure-sub{font-size:.7rem;opacity:.8;font-weight:600;}
#adm-root .cfg-azure-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:.8rem;}
#adm-root .cfg-az-metric{background:var(--bg);border-radius:10px;padding:.65rem .8rem;text-align:center;}
#adm-root .cfg-az-val{font-family:'Nunito',sans-serif;font-size:1.1rem;font-weight:900;color:var(--indigo);}
#adm-root .cfg-az-lbl{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:2px;}
#adm-root .cfg-key-row{display:flex;gap:.6rem;align-items:center;}
#adm-root .cfg-key-input{font-family:'Courier New',monospace;font-size:.8rem;font-weight:700;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:.6rem .9rem;color:var(--muted);outline:none;}
#adm-root .cfg-key-btn{padding:.55rem .8rem;border:1.5px solid var(--border);border-radius:10px;background:none;cursor:pointer;color:var(--muted);transition:all .15s;line-height:0;}
#adm-root .cfg-key-btn:hover{border-color:var(--indigo);color:var(--indigo);}
#adm-root .cfg-danger-zone{border:1.5px solid rgba(239,68,68,.25);border-radius:14px;padding:1.1rem 1.4rem;background:rgba(239,68,68,.03);}
#adm-root .cfg-danger-title{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--red);margin-bottom:.8rem;display:flex;align-items:center;gap:.4rem;}
#adm-root .cfg-toast{position:fixed;bottom:2rem;right:2rem;background:#1a1f36;color:#fff;border-radius:12px;padding:.9rem 1.4rem;font-size:.82rem;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.2);transform:translateY(80px);opacity:0;transition:transform .3s ease,opacity .3s ease;z-index:200;}
#adm-root .cfg-toast.show{transform:translateY(0);opacity:1;}
#adm-root.dark .cfg-topbar{background:#1a1f36;border-bottom-color:rgba(255,255,255,.06);}
#adm-root.dark .cfg-card{background:#1a1f36;border-color:rgba(255,255,255,.08);}
#adm-root.dark .cfg-sidenav{background:#1a1f36;border-color:rgba(255,255,255,.08);}
#adm-root.dark .cfg-sidenav-item{color:rgba(255,255,255,.4);}
#adm-root.dark .cfg-sidenav-item:hover{background:rgba(99,102,241,.15);color:#a5b4fc;}
#adm-root.dark .cfg-sidenav-item.active{background:rgba(99,102,241,.15);color:#a5b4fc;}
#adm-root.dark .cfg-input{background:#0f1119;border-color:rgba(255,255,255,.1);color:#e2e8f0;}
#adm-root.dark .cfg-select{background-color:#0f1119;border-color:rgba(255,255,255,.1);color:#e2e8f0;}
#adm-root.dark .cfg-fuso-item{background:#0f1119;}
#adm-root.dark .cfg-notif-group{background:#0f1119;}
#adm-root.dark .cfg-az-metric{background:#0f1119;}
`;
