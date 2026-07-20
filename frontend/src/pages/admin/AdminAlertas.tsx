/**
 * Admin OS — Central de Alertas.
 * Replicates mock at /originais/OS/admin-alertas.html.
 * KPIs clicáveis (todos/crítico/atenção/info/resolvidos), tabs por tipo,
 * lista de alertas com ações resolver, painel lateral com estatísticas + timeline.
 */
import { useEffect, useMemo, useState } from 'react';
import { alertsApi } from '../../api/alertsApi';
import { useAuth } from '../../hooks/useAuth';
import type { Alert, AlertLevel, AlertsSummary, AlertType } from '../../types';
import { formatHmCompactBR, formatLongDateBR, formatShortDateBR } from '../../utils/dateTimeBR';

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; onOpenSidebar?: () => void; }

type NivelFilter = 'todos' | 'critico' | 'atencao' | 'info' | 'resolvido';

const NIVEL_LABEL: Record<NivelFilter, string> = {
  todos: 'Todos', critico: '🔴 Crítico', atencao: '🟡 Atenção', info: '🔵 Informativo', resolvido: '🟢 Resolvidos',
};

const LEVEL_TO_KIND: Record<AlertLevel, 'critico' | 'atencao' | 'info' | 'resolvido'> = {
  Critical: 'critico', Warning: 'atencao', Info: 'info', Resolved: 'resolvido',
};

const TIPO_TABS: { key: '' | AlertType; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'UnannouncedAbsence', label: 'Ausência' },
  { key: 'UncoveredShift', label: 'Turno descoberto' },
  { key: 'Delay', label: 'Atraso' },
  { key: 'SlaBelow', label: 'SLA' },
  { key: 'ContractExpiring', label: 'Contrato' },
  { key: 'PendingConfirmation', label: 'Confirmação' },
];

function fmtRelative(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin} min atrás`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Ontem';
  if (d < 7) return `${d}d atrás`;
  return formatShortDateBR(iso);
}

function fmtTimeShort(iso: string) {
  return formatHmCompactBR(iso);
}

// Renderiza descrição com <strong> escapando o resto (defesa contra XSS)
function renderDesc(desc: string) {
  // Split apenas em <strong>...</strong> — restante escapado
  const parts = desc.split(/(<strong>.*?<\/strong>)/g);
  return parts.map((p, i) => {
    const m = p.match(/^<strong>(.*?)<\/strong>$/);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <span key={i}>{p}</span>;
  });
}

export function AdminAlertas({ dark, onToggleTheme, onOpenSidebar }: Props) {
  const { user: authUser } = useAuth();
  const canManage = (authUser?.roles ?? []).some(r => r === 'AdminGlobal' || r === 'AdminClinica');

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [nivel, setNivel] = useState<NivelFilter>('todos');
  const [tipo, setTipo] = useState<'' | AlertType>('');
  const [search, setSearch] = useState('');
  const [filterClinic, setFilterClinic] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [modalTarget, setModalTarget] = useState<Alert | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    return Promise.all([
      alertsApi.getAll().catch(() => []),
      alertsApi.getSummary().catch(() => null),
    ]).then(([list, summ]) => {
      setAlerts(Array.isArray(list) ? list : []);
      setSummary(summ);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  // Lista de UPAs distintas dos alertas (para o filtro)
  const clinicOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alerts) {
      if (a.clinicId && a.clinicName) map.set(a.clinicId, a.clinicName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      // Nível
      if (nivel === 'resolvido' && !a.isResolved) return false;
      if (nivel !== 'todos' && nivel !== 'resolvido') {
        const kind = LEVEL_TO_KIND[a.level];
        if (kind !== nivel || a.isResolved) return false;
      }
      if (tipo && a.type !== tipo) return false;
      if (filterClinic && a.clinicId !== filterClinic) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.title.toLowerCase().includes(q) &&
            !a.description.toLowerCase().includes(q) &&
            !a.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, nivel, tipo, search, filterClinic]);

  function showToast(msg: string, err = false) {
    setToast(msg); setToastError(err);
    setTimeout(() => setToast(''), 3500);
  }

  async function handleResolve(id: string, notes?: string) {
    setSaving(true);
    try {
      await alertsApi.resolve(id, notes ? { resolutionNotes: notes } : undefined);
      await reload();
      showToast('✅ Alerta marcado como resolvido!');
      setModalTarget(null);
      setModalNotes('');
    } catch {
      showToast('Erro ao resolver alerta. Tente novamente.', true);
    } finally {
      setSaving(false);
    }
  }

  async function handleResolveAll() {
    if (!canManage) return;
    if (!confirm('Marcar TODOS os alertas abertos como resolvidos?')) return;
    setSaving(true);
    try {
      const { resolved } = await alertsApi.resolveAll();
      await reload();
      showToast(`✅ ${resolved} alerta${resolved !== 1 ? 's' : ''} resolvido${resolved !== 1 ? 's' : ''}!`);
    } catch {
      showToast('Erro ao resolver alertas em lote.', true);
    } finally {
      setSaving(false);
    }
  }

  const kpi = summary ?? { totalAll: 0, totalToday: 0, openCritical: 0, openWarning: 0, openInfo: 0, resolvedToday: 0 };

  // Contagens do lado direito
  const stats = useMemo(() => {
    return {
      uncovered: alerts.filter(a => !a.isResolved && a.type === 'UncoveredShift').length,
      delays: alerts.filter(a => !a.isResolved && a.type === 'Delay').length,
      absences: alerts.filter(a => !a.isResolved && a.type === 'UnannouncedAbsence').length,
      resolvedToday: kpi.resolvedToday,
    };
  }, [alerts, kpi.resolvedToday]);

  // Timeline: 6 alertas mais recentes ordenados por CreatedAt desc (independente de filtro)
  const timeline = useMemo(() => {
    return [...alerts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [alerts]);

  const dateStr = formatLongDateBR(new Date());
  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ALT_CSS }} />

      <div className="alt-topbar">
        <div className="alt-topbar-left">
          <button className="alt-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="alt-topbar-title">Central de Alertas</div>
            <div className="alt-topbar-sub">{dateStr}</div>
          </div>
        </div>
        <div className="alt-topbar-right">
          {canManage && (
            <button className="alt-btn-marcar-todos" onClick={handleResolveAll} disabled={saving || (kpi.openCritical + kpi.openWarning + kpi.openInfo) === 0}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Marcar todos como resolvido
            </button>
          )}
          <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
        </div>
      </div>

      <div className="alt-content">
        {/* KPIs clicáveis */}
        <div className="alt-kpi-strip">
          {(['todos', 'critico', 'atencao', 'info', 'resolvido'] as NivelFilter[]).map(k => {
            const val = k === 'todos' ? kpi.totalAll
              : k === 'critico' ? kpi.openCritical
              : k === 'atencao' ? kpi.openWarning
              : k === 'info' ? kpi.openInfo
              : kpi.resolvedToday;
            const sub = k === 'todos' ? 'alertas registrados'
              : k === 'critico' ? 'ação imediata'
              : k === 'atencao' ? 'monitorar'
              : k === 'info' ? 'sem ação necessária'
              : 'tratados hoje';
            return (
              <div key={k} className={`alt-kpi ${k} ${nivel === k ? 'selecionado' : ''}`} onClick={() => setNivel(k)}>
                <div className="alt-kpi-lbl">{NIVEL_LABEL[k]}</div>
                <div className="alt-kpi-val">{loading ? '—' : val}</div>
                <div className="alt-kpi-sub">{sub}</div>
              </div>
            );
          })}
        </div>

        <div className="alt-layout">
          {/* Coluna principal */}
          <div>
            <div className="alt-filter-bar">
              <div className="alt-tipo-tabs">
                {TIPO_TABS.map(t => (
                  <button key={t.key} className={`alt-tipo-tab ${tipo === t.key ? 'active' : ''}`} onClick={() => setTipo(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="alt-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="alt-search-input" type="text" placeholder="Buscar alerta..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="alt-filter-select" value={filterClinic} onChange={e => setFilterClinic(e.target.value)}>
                <option value="">Todas as UPAs</option>
                {clinicOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="alt-list">
              {loading ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>Carregando alertas...</div>
              ) : filtered.length === 0 ? (
                <div className="alt-empty-state">
                  <div className="alt-empty-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div className="alt-empty-title">Nenhum alerta encontrado</div>
                  <div className="alt-empty-sub">Não há alertas para os filtros selecionados.</div>
                </div>
              ) : filtered.map(a => {
                const kind = LEVEL_TO_KIND[a.level];
                const canAct = canManage && !a.isResolved;
                return (
                  <div key={a.id} className={`alt-card ${kind}`}>
                    <div className="alt-card-body">
                      <div className="alt-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          {kind === 'critico' && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                          {kind === 'atencao' && <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
                          {kind === 'info' && <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>}
                          {kind === 'resolvido' && <polyline points="20 6 9 17 4 12"/>}
                        </svg>
                      </div>
                      <div className="alt-content-col">
                        <div className="alt-top">
                          <div className="alt-titulo">{a.title}</div>
                          <div className="alt-tempo">{fmtRelative(a.createdAt)}</div>
                        </div>
                        <div className="alt-desc">{renderDesc(a.description)}</div>
                        <div className="alt-meta">
                          <span className={`alt-badge alt-badge-${kind}`}>{a.levelLabel}</span>
                          {a.clinicName && <span className="alt-badge alt-badge-upa">{a.clinicName}</span>}
                          <span className="alt-badge alt-badge-tipo">{a.typeLabel}</span>
                          <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)' }}>{a.code}</span>
                        </div>
                      </div>
                    </div>
                    <div className="alt-footer">
                      <div className="alt-footer-info">
                        {a.isResolved
                          ? `✓ Tratado às ${fmtTimeShort(a.resolvedAt ?? a.createdAt)}${a.resolvedByUserName ? ` por ${a.resolvedByUserName}` : ''}`
                          : `⏱ Registrado às ${fmtTimeShort(a.createdAt)}`}
                      </div>
                      <div className="alt-acoes">
                        {canAct && a.primaryActionLabel && (
                          <button className="alt-btn-acao primario" onClick={() => { setModalTarget(a); setModalNotes(''); }}>
                            {a.primaryActionLabel}
                          </button>
                        )}
                        {a.secondaryActionLabel && (
                          <button className="alt-btn-acao secundario" onClick={() => showToast(`Ação: ${a.secondaryActionLabel}`)}>
                            {a.secondaryActionLabel}
                          </button>
                        )}
                        {canAct && (
                          <button className="alt-btn-acao ok" disabled={saving} onClick={() => handleResolve(a.id)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Resolver
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Painel lateral */}
          <div className="alt-side-stack">
            <div className="alt-side-card">
              <div className="alt-side-header"><div className="alt-side-title">Hoje em números</div></div>
              <div className="alt-side-body">
                <div className="alt-stat-grid">
                  <div className="alt-stat-item"><div className="alt-stat-val" style={{ color: 'var(--red)' }}>{stats.uncovered}</div><div className="alt-stat-lbl">Turnos descobertos</div></div>
                  <div className="alt-stat-item"><div className="alt-stat-val" style={{ color: 'var(--yellow)' }}>{stats.delays}</div><div className="alt-stat-lbl">Atrasos detectados</div></div>
                  <div className="alt-stat-item"><div className="alt-stat-val" style={{ color: 'var(--orange)' }}>{stats.absences}</div><div className="alt-stat-lbl">Ausências</div></div>
                  <div className="alt-stat-item"><div className="alt-stat-val" style={{ color: 'var(--green)' }}>{stats.resolvedToday}</div><div className="alt-stat-lbl">Resolvidos hoje</div></div>
                </div>
              </div>
            </div>

            <div className="alt-side-card">
              <div className="alt-side-header"><div className="alt-side-title">Timeline recente</div></div>
              <div className="alt-side-body">
                {timeline.length === 0 ? (
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600 }}>Nenhum alerta registrado ainda.</div>
                ) : (
                  <div className="alt-timeline">
                    {timeline.map(a => {
                      const kind = LEVEL_TO_KIND[a.level];
                      return (
                        <div key={a.id} className={`alt-tl-item ${kind}`}>
                          <div className="alt-tl-dot" />
                          <span className="alt-tl-hora">{fmtTimeShort(a.createdAt)}</span>
                          <span className="alt-tl-txt">{a.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`alt-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>

      {/* Modal de ação primária */}
      {modalTarget && (
        <div className="alt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalTarget(null); }}>
          <div className="alt-modal-box">
            <div className="alt-modal-header">
              <div className={`alt-modal-icon ${LEVEL_TO_KIND[modalTarget.level]}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div className="alt-modal-title">{modalTarget.primaryActionLabel}</div>
              <button className="alt-modal-close" onClick={() => setModalTarget(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="alt-modal-body">
              <div className="alt-modal-desc">{renderDesc(modalTarget.description)}</div>
              <div className="alt-modal-field">
                <label className="alt-modal-label">Notas da resolução (opcional)</label>
                <textarea className="alt-modal-textarea" value={modalNotes} onChange={e => setModalNotes(e.target.value)} placeholder="Detalhes da ação tomada..." />
              </div>
            </div>
            <div className="alt-modal-footer">
              <button className="alt-btn-cancelar" onClick={() => setModalTarget(null)}>Cancelar</button>
              <button className="alt-btn-confirmar" disabled={saving} onClick={() => handleResolve(modalTarget.id, modalNotes.trim() || undefined)}>
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const ALT_CSS = `
#adm-root .alt-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:40; }
#adm-root .alt-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .alt-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; }
#adm-root .alt-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .alt-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .alt-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }
#adm-root .alt-topbar-right { display:flex; align-items:center; gap:.7rem; }
#adm-root .alt-btn-marcar-todos { display:flex; align-items:center; gap:.4rem; padding:.5rem 1rem; border-radius:10px; border:1.5px solid var(--border); background:none; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .alt-btn-marcar-todos:hover:not(:disabled) { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .alt-btn-marcar-todos:disabled { opacity:.4; cursor:not-allowed; }
#adm-root .alt-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }

#adm-root .alt-kpi-strip { display:grid; grid-template-columns:repeat(5,1fr); gap:1rem; margin-bottom:1.4rem; }
#adm-root .alt-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:.9rem 1.1rem; position:relative; overflow:hidden; cursor:pointer; transition:transform .15s,box-shadow .15s; }
#adm-root .alt-kpi:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,.07); }
#adm-root .alt-kpi.selecionado { box-shadow:0 0 0 2.5px var(--indigo); }
#adm-root .alt-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .alt-kpi.todos::after { background:var(--indigo); }
#adm-root .alt-kpi.critico::after { background:var(--red); }
#adm-root .alt-kpi.atencao::after { background:var(--yellow); }
#adm-root .alt-kpi.info::after { background:#3b82f6; }
#adm-root .alt-kpi.resolvido::after { background:var(--green); }
#adm-root .alt-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.2rem; }
#adm-root .alt-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .alt-kpi.todos .alt-kpi-val { color:var(--indigo); }
#adm-root .alt-kpi.critico .alt-kpi-val { color:var(--red); }
#adm-root .alt-kpi.atencao .alt-kpi-val { color:var(--yellow); }
#adm-root .alt-kpi.info .alt-kpi-val { color:#3b82f6; }
#adm-root .alt-kpi.resolvido .alt-kpi-val { color:var(--green); }
#adm-root .alt-kpi-sub { font-size:.65rem; font-weight:600; color:var(--muted); margin-top:.2rem; }

#adm-root .alt-layout { display:grid; grid-template-columns:1fr 320px; gap:1.2rem; align-items:start; }

#adm-root .alt-filter-bar { display:flex; align-items:center; gap:.7rem; margin-bottom:1rem; flex-wrap:wrap; }
#adm-root .alt-tipo-tabs { display:flex; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:3px; gap:2px; flex-wrap:wrap; }
#adm-root .alt-tipo-tab { padding:.38rem .85rem; border-radius:9px; border:none; font-family:'Nunito',sans-serif; font-size:.75rem; font-weight:800; cursor:pointer; transition:all .15s; background:none; color:var(--muted); white-space:nowrap; }
#adm-root .alt-tipo-tab.active { background:var(--indigo); color:#fff; box-shadow:0 2px 8px rgba(99,102,241,.3); }
#adm-root .alt-tipo-tab:hover:not(.active) { background:var(--indigo-light); color:var(--indigo); }
#adm-root .alt-search-wrap { position:relative; flex:1; min-width:200px; }
#adm-root .alt-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .alt-search-input { width:100%; padding:.6rem 1rem .6rem 2.4rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .alt-search-input:focus { border-color:var(--indigo); }
#adm-root .alt-filter-select { appearance:none; -webkit-appearance:none; background:var(--surface); border:1.5px solid var(--border); border-radius:10px; padding:.6rem 2.1rem .6rem .85rem; font-family:'Nunito Sans',sans-serif; font-size:.78rem; font-weight:700; color:var(--text); outline:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .6rem center; }
#adm-root .alt-filter-select:focus { border-color:var(--indigo); }

#adm-root .alt-list { display:flex; flex-direction:column; gap:.7rem; }
#adm-root .alt-card { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); border-left:4px solid; overflow:hidden; transition:transform .15s,box-shadow .15s; }
#adm-root .alt-card:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,0,0,.07); }
#adm-root .alt-card.critico { border-left-color:var(--red); }
#adm-root .alt-card.atencao { border-left-color:var(--yellow); }
#adm-root .alt-card.info { border-left-color:#3b82f6; }
#adm-root .alt-card.resolvido { border-left-color:var(--green); opacity:.75; }
#adm-root .alt-card-body { padding:.9rem 1.2rem; display:flex; align-items:flex-start; gap:.9rem; }
#adm-root .alt-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
#adm-root .alt-card.critico .alt-icon { background:var(--red-light); color:var(--red); }
#adm-root .alt-card.atencao .alt-icon { background:var(--yellow-light); color:var(--yellow); }
#adm-root .alt-card.info .alt-icon { background:#eff6ff; color:#3b82f6; }
#adm-root .alt-card.resolvido .alt-icon { background:var(--green-light); color:var(--green); }
#adm-root .alt-content-col { flex:1; min-width:0; }
#adm-root .alt-top { display:flex; align-items:flex-start; justify-content:space-between; gap:.6rem; margin-bottom:.25rem; }
#adm-root .alt-titulo { font-family:'Nunito',sans-serif; font-size:.92rem; font-weight:900; color:var(--text); line-height:1.3; }
#adm-root .alt-card.resolvido .alt-titulo { color:var(--muted); }
#adm-root .alt-tempo { font-size:.68rem; font-weight:800; color:var(--muted); white-space:nowrap; flex-shrink:0; }
#adm-root .alt-desc { font-size:.78rem; font-weight:600; color:var(--muted); line-height:1.5; margin-bottom:.55rem; }
#adm-root .alt-desc strong { color:var(--text); }
#adm-root .alt-meta { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
#adm-root .alt-badge { display:inline-flex; align-items:center; gap:.28rem; font-size:.62rem; font-weight:800; padding:.2rem .6rem; border-radius:20px; white-space:nowrap; }
#adm-root .alt-badge-critico { background:var(--red-light); color:#dc2626; }
#adm-root .alt-badge-atencao { background:var(--yellow-light); color:#b45309; }
#adm-root .alt-badge-info { background:#eff6ff; color:#3b82f6; }
#adm-root .alt-badge-resolvido { background:var(--green-light); color:#16a34a; }
#adm-root .alt-badge-upa { background:var(--bg); color:var(--muted); border:1px solid rgba(0,0,0,.06); }
#adm-root .alt-badge-tipo { background:var(--indigo-light); color:var(--indigo); }
#adm-root .alt-footer { padding:.65rem 1.2rem; border-top:1px solid rgba(0,0,0,.05); display:flex; align-items:center; justify-content:space-between; gap:.6rem; background:rgba(0,0,0,.015); }
#adm-root .alt-footer-info { font-size:.68rem; font-weight:700; color:var(--muted); }
#adm-root .alt-acoes { display:flex; gap:.4rem; flex-wrap:wrap; }
#adm-root .alt-btn-acao { display:flex; align-items:center; gap:.35rem; padding:.35rem .8rem; border-radius:8px; border:1.5px solid; font-family:'Nunito',sans-serif; font-size:.72rem; font-weight:800; cursor:pointer; transition:all .15s; }
#adm-root .alt-btn-acao.primario { background:var(--indigo); border-color:var(--indigo); color:#fff; box-shadow:0 2px 8px rgba(99,102,241,.25); }
#adm-root .alt-btn-acao.primario:hover:not(:disabled) { background:var(--indigo-dark); }
#adm-root .alt-btn-acao.secundario { background:none; border-color:var(--border); color:var(--muted); }
#adm-root .alt-btn-acao.secundario:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .alt-btn-acao.ok { background:var(--green-light); border-color:rgba(34,197,94,.3); color:#16a34a; }
#adm-root .alt-btn-acao.ok:hover:not(:disabled) { background:rgba(34,197,94,.2); }
#adm-root .alt-btn-acao:disabled { opacity:.5; cursor:not-allowed; }

#adm-root .alt-empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:3rem; background:var(--surface); border-radius:16px; border:1.5px solid var(--border); gap:.7rem; }
#adm-root .alt-empty-icon { width:56px; height:56px; border-radius:50%; background:var(--green-light); display:flex; align-items:center; justify-content:center; }
#adm-root .alt-empty-title { font-family:'Nunito',sans-serif; font-size:1rem; font-weight:900; color:var(--green); }
#adm-root .alt-empty-sub { font-size:.8rem; font-weight:600; color:var(--muted); text-align:center; }

#adm-root .alt-side-stack { display:flex; flex-direction:column; gap:.9rem; }
#adm-root .alt-side-card { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .alt-side-header { padding:.85rem 1.2rem; border-bottom:1px solid var(--border); }
#adm-root .alt-side-title { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; color:var(--text); }
#adm-root .alt-side-body { padding:.9rem 1.1rem; }

#adm-root .alt-stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; }
#adm-root .alt-stat-item { background:var(--bg); border-radius:10px; padding:.65rem .8rem; text-align:center; }
#adm-root .alt-stat-val { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; line-height:1; }
#adm-root .alt-stat-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-top:3px; }

#adm-root .alt-timeline { display:flex; flex-direction:column; gap:0; position:relative; padding-left:1.4rem; }
#adm-root .alt-timeline::before { content:''; position:absolute; left:5px; top:4px; bottom:4px; width:2px; background:linear-gradient(to bottom,var(--indigo),rgba(99,102,241,.1)); border-radius:2px; }
#adm-root .alt-tl-item { position:relative; padding:.4rem 0 .4rem .2rem; font-size:.74rem; }
#adm-root .alt-tl-dot { position:absolute; left:-1.1rem; top:9px; width:10px; height:10px; border-radius:50%; border:2px solid var(--surface); box-shadow:0 0 0 2px currentColor; }
#adm-root .alt-tl-item.critico .alt-tl-dot { color:var(--red); background:var(--red); }
#adm-root .alt-tl-item.atencao .alt-tl-dot { color:var(--yellow); background:var(--yellow); }
#adm-root .alt-tl-item.info .alt-tl-dot { color:#3b82f6; background:#3b82f6; }
#adm-root .alt-tl-item.resolvido .alt-tl-dot { color:var(--green); background:var(--green); }
#adm-root .alt-tl-hora { font-weight:800; color:var(--muted); font-size:.65rem; display:block; }
#adm-root .alt-tl-txt { font-weight:700; color:var(--text); line-height:1.3; }

#adm-root .alt-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; display:flex; align-items:center; justify-content:center; padding:1rem; animation:fadeIn .2s ease; }
#adm-root .alt-modal-box { background:var(--surface); border-radius:20px; width:100%; max-width:480px; box-shadow:0 20px 60px rgba(0,0,0,.15); animation:popIn .3s cubic-bezier(.34,1.56,.64,1); overflow:hidden; }
#adm-root .alt-modal-header { padding:1.3rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:.7rem; }
#adm-root .alt-modal-icon { width:38px; height:38px; border-radius:11px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
#adm-root .alt-modal-icon.critico { background:var(--red-light); color:var(--red); }
#adm-root .alt-modal-icon.atencao { background:var(--yellow-light); color:var(--yellow); }
#adm-root .alt-modal-icon.info { background:#eff6ff; color:#3b82f6; }
#adm-root .alt-modal-icon.resolvido { background:var(--green-light); color:var(--green); }
#adm-root .alt-modal-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); flex:1; }
#adm-root .alt-modal-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .alt-modal-close:hover { color:var(--text); }
#adm-root .alt-modal-body { padding:1.4rem 1.6rem; }
#adm-root .alt-modal-desc { font-size:.85rem; font-weight:600; color:var(--muted); line-height:1.6; margin-bottom:1.2rem; }
#adm-root .alt-modal-desc strong { color:var(--text); }
#adm-root .alt-modal-field { display:flex; flex-direction:column; gap:.3rem; }
#adm-root .alt-modal-label { font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .alt-modal-textarea { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; resize:vertical; min-height:80px; }
#adm-root .alt-modal-textarea:focus { border-color:var(--indigo); background:#fff; }
#adm-root .alt-modal-footer { padding:1rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; }
#adm-root .alt-btn-confirmar { flex:1; padding:.8rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); transition:transform .14s; }
#adm-root .alt-btn-confirmar:hover:not(:disabled) { transform:translateY(-1px); }
#adm-root .alt-btn-confirmar:disabled { opacity:.5; cursor:not-allowed; }
#adm-root .alt-btn-cancelar { padding:.8rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; }
#adm-root .alt-btn-cancelar:hover { border-color:var(--indigo); color:var(--indigo); }

#adm-root .alt-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .alt-toast.show { transform:translateY(0); opacity:1; }
#adm-root .alt-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }

/* Dark mode */
#adm-root.dark .alt-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .alt-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .alt-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .alt-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .alt-filter-select { background-color:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .alt-tipo-tabs { background:#1a1f36; border-color:rgba(255,255,255,.1); }
#adm-root.dark .alt-side-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .alt-side-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .alt-stat-item { background:#0f1119; }
#adm-root.dark .alt-modal-box { background:#1a1f36; }
#adm-root.dark .alt-modal-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .alt-modal-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .alt-modal-textarea { background:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .alt-btn-cancelar { border-color:rgba(255,255,255,.1); color:#94a3b8; }
#adm-root.dark .alt-empty-state { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .alt-footer { background:rgba(255,255,255,.02); border-top-color:rgba(255,255,255,.04); }
#adm-root.dark .alt-tl-dot { border-color:#1a1f36; }

/* Base: garante que grid não estoure horizontalmente */
#adm-root .alt-content { min-width:0; }
#adm-root .alt-layout { min-width:0; }
#adm-root .alt-layout > * { min-width:0; }
#adm-root .alt-filter-bar > * { min-width:0; }

/* Responsive */
@media (max-width: 1100px) {
  #adm-root .alt-layout { grid-template-columns:1fr; }
  #adm-root .alt-kpi-strip { grid-template-columns:repeat(3,1fr); }
}
@media (max-width: 768px) {
  #adm-root .alt-hamburger { display:flex; }
  #adm-root .alt-topbar { padding:.85rem 1rem; flex-wrap:wrap; gap:.5rem; }
  #adm-root .alt-topbar-right { flex-wrap:wrap; gap:.4rem; }
  #adm-root .alt-btn-marcar-todos { padding:.45rem .8rem; font-size:.72rem; }
  #adm-root .alt-content { padding:1rem; overflow-x:hidden; }
  #adm-root .alt-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .alt-kpi { padding:.75rem .85rem; }
  #adm-root .alt-kpi-val { font-size:1.3rem; }

  /* Filtros em coluna */
  #adm-root .alt-filter-bar { flex-direction:column; align-items:stretch; gap:.55rem; }

  /* Tabs com scroll horizontal isolado — não empurra o layout */
  #adm-root .alt-tipo-tabs {
    display:flex;
    flex-wrap:nowrap;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
    max-width:100%;
    scrollbar-width:none;
  }
  #adm-root .alt-tipo-tabs::-webkit-scrollbar { display:none; }
  #adm-root .alt-tipo-tab { white-space:nowrap; flex-shrink:0; }

  #adm-root .alt-search-wrap { min-width:0; width:100%; }
  #adm-root .alt-filter-select { width:100%; min-width:0; }

  #adm-root .alt-card-body { padding:.75rem .9rem; gap:.6rem; }
  #adm-root .alt-icon { width:32px; height:32px; }
  #adm-root .alt-footer { padding:.55rem .9rem; flex-wrap:wrap; }
  #adm-root .alt-acoes { width:100%; }

  /* Stats do card lateral: labels não podem estourar */
  #adm-root .alt-stat-grid { gap:.45rem; }
  #adm-root .alt-stat-item { padding:.55rem .5rem; min-width:0; }
  #adm-root .alt-stat-val { font-size:1.15rem; }
  #adm-root .alt-stat-lbl { font-size:.55rem; letter-spacing:.04em; line-height:1.25; }
}
@media (max-width: 480px) {
  #adm-root .alt-kpi-strip { grid-template-columns:1fr 1fr; gap:.5rem; }
  #adm-root .alt-topbar-title { font-size:.95rem; }
  #adm-root .alt-topbar-sub { font-size:.62rem; }
  #adm-root .alt-btn-marcar-todos span,
  #adm-root .alt-btn-marcar-todos { font-size:.68rem; padding:.4rem .55rem; }
}
`;
