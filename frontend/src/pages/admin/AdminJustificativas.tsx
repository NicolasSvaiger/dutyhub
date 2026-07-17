/**
 * Admin OS — Gestão de Justificativas.
 * Acionamentos formais da Prefeitura → OS. A OS analisa e responde.
 * Replicates mock at /originais/OS/admin-justificativas.html.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { justificationsApi } from '../../api/justificationsApi';
import { clinicsApi } from '../../api/clinicsApi';
import { useAuth } from '../../hooks/useAuth';
import type { Clinic, Justification, JustificationStatus } from '../../types';

// ─── CustomSelect ─────────────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);
  return (
    <div className="jus-cselect" ref={ref}>
      <button className="jus-cselect-btn" type="button" onClick={() => setOpen(!open)}>
        <span>{selected?.label ?? 'Selecione...'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="jus-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`jus-cselect-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORES = ['#6366f1', '#2DBFB8', '#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444', '#0f766e', '#7c3aed'];

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CORES[hash % CORES.length];
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const STATUS_TO_BADGE_CLASS: Record<JustificationStatus, string> = {
  Pending: 'jus-badge-pendente',
  UnderAnalysis: 'jus-badge-em-anl',
  Approved: 'jus-badge-aprovada',
  Rejected: 'jus-badge-reprovada',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; onOpenSidebar?: () => void; }

export function AdminJustificativas({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');
  const canManage = isAdminGlobal || (authUser?.roles ?? []).includes('AdminClinica');

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [items, setItems] = useState<Justification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClinic, setFilterClinic] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalTarget, setModalTarget] = useState<Justification | null>(null);
  const [respostaText, setRespostaText] = useState('');

  function loadAll() {
    setLoading(true);
    return Promise.all([
      clinicsApi.getAll().catch(() => []),
      justificationsApi.getAll().catch(() => []),
    ]).then(([c, j]) => {
      setClinics(Array.isArray(c) ? c : []);
      setItems(Array.isArray(j) ? j : []);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadAll(); }, []);

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpiPending = items.filter(i => i.status === 'Pending').length;
  const kpiUnderAnalysis = items.filter(i => i.status === 'UnderAnalysis').length;
  const kpiApproved = items.filter(i => i.status === 'Approved').length;
  const kpiRejected = items.filter(i => i.status === 'Rejected').length;

  // ── Lista filtrada ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = items.filter(j => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          j.protocolNumber.toLowerCase().includes(q) ||
          j.absentUserName.toLowerCase().includes(q) ||
          j.clinicName.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterStatus && j.status !== filterStatus) return false;
      if (filterClinic && j.clinicId !== filterClinic) return false;
      return true;
    });
    // Ordena: pendentes vencidas primeiro, depois pendentes, depois em análise, depois resolvidas por data desc
    const rank = (j: Justification) => {
      if (j.isDeadlineOverdue) return 0;
      if (j.status === 'Pending') return 1;
      if (j.status === 'UnderAnalysis') return 2;
      return 3;
    };
    list = [...list].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [items, search, filterStatus, filterClinic]);

  function showToast(msg: string, err = false) {
    setToast(msg); setToastError(err);
    setTimeout(() => setToast(''), 3500);
  }

  function openModal(j: Justification) {
    setModalTarget(j);
    setRespostaText('');
  }

  function closeModal() {
    setModalTarget(null);
    setRespostaText('');
  }

  async function respond(id: string, approve: boolean) {
    if (!respostaText.trim()) {
      showToast('Preencha a resposta formal antes.', true);
      return;
    }
    setSaving(true);
    try {
      await justificationsApi.respond(id, { approve, responseText: respostaText.trim() });
      await loadAll();
      closeModal();
      showToast(`Justificativa ${approve ? 'aprovada' : 'reprovada'} com sucesso!`);
    } catch {
      showToast('Erro ao responder justificativa. Tente novamente.', true);
    } finally {
      setSaving(false);
    }
  }

  function prazoLabel(j: Justification): { text: string; cls: string } {
    if (j.status === 'Approved' || j.status === 'Rejected') {
      return { text: '✓ Concluído', cls: 'jus-prazo-ok' };
    }
    const d = j.daysToDeadline ?? 0;
    if (d < 0) return { text: `Vencido há ${Math.abs(d)}d`, cls: 'jus-prazo-venc' };
    if (d <= 2) return { text: `⏱ Até ${formatDate(j.deadlineDate)}`, cls: 'jus-prazo-warn' };
    return { text: `Até ${formatDate(j.deadlineDate)}`, cls: 'jus-prazo-ok' };
  }

  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: JUS_CSS }} />

      <div className="jus-topbar">
        <div className="jus-topbar-left">
          <button className="jus-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="jus-topbar-title">Gestão de Justificativas</div>
            <div className="jus-topbar-sub">Análise e resposta às justificativas de ausência enviadas pelo Órgão Público</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
      </div>

      <div className="jus-content">
        <div className="jus-page-header">
          <div>
            <div className="jus-page-title">Justificativas de Ausência</div>
            <div className="jus-page-sub">Acionamentos recebidos da prefeitura que aguardam resposta formal da OS</div>
          </div>
          {!canManage && (
            <div className="jus-readonly-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Somente leitura
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="jus-kpi-strip">
          <div className="jus-kpi yellow"><div className="jus-kpi-lbl">Aguardando análise</div><div className="jus-kpi-val">{loading ? '—' : kpiPending}</div><div className="jus-kpi-sub">resposta pendente</div></div>
          <div className="jus-kpi indigo"><div className="jus-kpi-lbl">Em análise</div><div className="jus-kpi-val">{loading ? '—' : kpiUnderAnalysis}</div><div className="jus-kpi-sub">sendo analisadas</div></div>
          <div className="jus-kpi green"><div className="jus-kpi-lbl">Aprovadas</div><div className="jus-kpi-val">{loading ? '—' : kpiApproved}</div><div className="jus-kpi-sub">no mês</div></div>
          <div className="jus-kpi red"><div className="jus-kpi-lbl">Reprovadas</div><div className="jus-kpi-val">{loading ? '—' : kpiRejected}</div><div className="jus-kpi-sub">com penalidade aplicada</div></div>
        </div>

        {/* Filtros */}
        <div className="jus-filter-bar">
          <div className="jus-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="jus-search-input" type="text" placeholder="Buscar por médico, UPA ou protocolo..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'Pending', label: 'Aguardando análise' },
              { value: 'UnderAnalysis', label: 'Em análise' },
              { value: 'Approved', label: 'Aprovada' },
              { value: 'Rejected', label: 'Reprovada' },
            ]}
          />
          <CustomSelect
            value={filterClinic}
            onChange={setFilterClinic}
            options={[
              { value: '', label: 'Todas as UPAs' },
              ...clinics.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        {/* Tabela */}
        <div className="jus-table-card">
          <div className="jus-table-header-bar">
            <div className="jus-table-title">Acionamentos recebidos</div>
            <div className="jus-table-count">{filtered.length} justificativa{filtered.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="jus-table">
              <thead>
                <tr>
                  <th>Protocolo</th>
                  <th>Médico</th>
                  <th>UPA · Data · Turno</th>
                  <th>Tipo de acionamento</th>
                  <th className="center">Status</th>
                  <th className="center">Prazo resposta</th>
                  <th className="center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>Nenhuma justificativa encontrada.</td></tr>
                ) : filtered.map(j => {
                  const prazo = prazoLabel(j);
                  const canRespond = canManage && (j.status === 'Pending' || j.status === 'UnderAnalysis');
                  return (
                    <tr key={j.id}>
                      <td><span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--muted)' }}>{j.protocolNumber}</span></td>
                      <td>
                        <div className="jus-td-med">
                          <div className="jus-td-av" style={{ background: colorFor(j.absentUserId) }}>{initials(j.absentUserName)}</div>
                          <div>
                            <div className="jus-td-name">{j.absentUserName}</div>
                            {j.absentUserRegistrationNumber && <div className="jus-td-sub">{j.absentUserRegistrationNumber}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{j.clinicName}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>{formatDateShort(j.shiftDate)} · {j.shiftTurn}</div>
                      </td>
                      <td style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, maxWidth: 180 }}>{j.requestTypeLabel}</td>
                      <td className="center"><span className={`jus-badge ${STATUS_TO_BADGE_CLASS[j.status]}`}>{j.statusLabel}</span></td>
                      <td className="center"><span className={prazo.cls}>{prazo.text}</span></td>
                      <td className="center">
                        <div className="jus-actions-cell">
                          <button className="jus-act-btn ver" onClick={() => openModal(j)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            Ver
                          </button>
                          {canRespond && (
                            <>
                              <button className="jus-act-btn aprovar" title="Aprovar" onClick={() => openModal(j)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </button>
                              <button className="jus-act-btn reprovar" title="Reprovar" onClick={() => openModal(j)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`jus-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>

      {/* Modal de detalhe/resposta */}
      {modalTarget && (
        <div className="jus-modal-overlay open" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="jus-modal-box">
            <div className="jus-modal-header">
              <div className="jus-modal-title">Justificativa — {modalTarget.protocolNumber}</div>
              <button className="jus-modal-close" onClick={closeModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="jus-modal-body">
              <div className="jus-detail-grid">
                <div className="jus-detail-item"><div className="jus-detail-lbl">Médico</div><div className="jus-detail-val">{modalTarget.absentUserName}</div></div>
                <div className="jus-detail-item"><div className="jus-detail-lbl">UPA</div><div className="jus-detail-val">{modalTarget.clinicName}</div></div>
                <div className="jus-detail-item"><div className="jus-detail-lbl">Data · Turno</div><div className="jus-detail-val">{formatDate(modalTarget.shiftDate)} · {modalTarget.shiftTurn}</div></div>
                <div className="jus-detail-item"><div className="jus-detail-lbl">Tipo</div><div className="jus-detail-val" style={{ fontSize: '.78rem' }}>{modalTarget.requestTypeLabel}</div></div>
              </div>
              <div className="jus-justif-text-box">
                <div className="jus-justif-text-label">Justificativa enviada pelo Órgão Público</div>
                <div className="jus-justif-text">{modalTarget.requestText}</div>
              </div>
              {modalTarget.status === 'Approved' || modalTarget.status === 'Rejected' ? (
                <div className="jus-justif-text-box">
                  <div className="jus-justif-text-label">Resposta da OS</div>
                  <div className="jus-justif-text">{modalTarget.responseText || '—'}</div>
                  {modalTarget.respondedByUserName && (
                    <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--muted)', marginTop: '.5rem' }}>
                      Respondido por {modalTarget.respondedByUserName}
                      {modalTarget.respondedAt && ` em ${new Date(modalTarget.respondedAt).toLocaleString('pt-BR')}`}
                    </div>
                  )}
                </div>
              ) : canManage && (
                <div className="jus-resposta-field">
                  <label>Resposta da OS (obrigatório para aprovar ou reprovar)</label>
                  <textarea value={respostaText} onChange={e => setRespostaText(e.target.value)}
                    placeholder="Descreva a decisão e os fundamentos para a resposta formal..." />
                </div>
              )}
            </div>
            <div className="jus-modal-footer">
              {modalTarget.status === 'Approved' || modalTarget.status === 'Rejected' ? (
                <>
                  <span className={`jus-badge ${STATUS_TO_BADGE_CLASS[modalTarget.status]}`} style={{ fontSize: '.78rem', padding: '.4rem .9rem' }}>{modalTarget.statusLabel}</span>
                  <button className="jus-btn-fechar" onClick={closeModal}>Fechar</button>
                </>
              ) : (
                <>
                  <button className="jus-btn-fechar" onClick={closeModal}>Fechar</button>
                  {canManage && (
                    <>
                      <button className="jus-btn-reprovar" disabled={saving} onClick={() => respond(modalTarget.id, false)}>
                        {saving ? 'Salvando...' : 'Reprovar'}
                      </button>
                      <button className="jus-btn-aprovar" disabled={saving} onClick={() => respond(modalTarget.id, true)}>
                        {saving ? 'Salvando...' : 'Aprovar'}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const JUS_CSS = `
#adm-root .jus-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .jus-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .jus-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .jus-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .jus-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .jus-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .jus-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .jus-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .jus-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .jus-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .jus-readonly-badge { display:flex; align-items:center; gap:.4rem; background:var(--indigo-light); border:1.5px solid rgba(99,102,241,.2); border-radius:10px; padding:.5rem .9rem; font-size:.72rem; font-weight:800; color:var(--indigo); }
#adm-root .jus-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .jus-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .jus-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .jus-kpi.yellow::after{background:var(--yellow);} #adm-root .jus-kpi.green::after{background:var(--green);} #adm-root .jus-kpi.red::after{background:var(--red);} #adm-root .jus-kpi.indigo::after{background:var(--indigo);}
#adm-root .jus-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .jus-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .jus-kpi.yellow .jus-kpi-val{color:var(--yellow);} #adm-root .jus-kpi.green .jus-kpi-val{color:var(--green);} #adm-root .jus-kpi.red .jus-kpi-val{color:var(--red);} #adm-root .jus-kpi.indigo .jus-kpi-val{color:var(--indigo);}
#adm-root .jus-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .jus-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .jus-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .jus-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .jus-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .jus-search-input:focus { border-color:var(--indigo); }
#adm-root .jus-table-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .jus-table-header-bar { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .jus-table-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .jus-table-count { font-size:.72rem; font-weight:700; color:var(--muted); }
#adm-root .jus-table { width:100%; border-collapse:collapse; }
#adm-root .jus-table thead tr { background:var(--bg); border-bottom:1px solid var(--border); }
#adm-root .jus-table thead th { padding:.75rem 1.1rem; font-size:.63rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); text-align:left; white-space:nowrap; }
#adm-root .jus-table thead th.center { text-align:center; }
#adm-root .jus-table tbody tr { border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .jus-table tbody tr:last-child { border-bottom:none; }
#adm-root .jus-table tbody tr:hover { background:#f9f9fc; }
#adm-root .jus-table tbody td { padding:.85rem 1.1rem; font-size:.82rem; font-weight:600; color:var(--text); vertical-align:middle; }
#adm-root .jus-table tbody td.center { text-align:center; }
#adm-root .jus-td-med { display:flex; align-items:center; gap:.7rem; }
#adm-root .jus-td-av { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .jus-td-name { font-weight:800; }
#adm-root .jus-td-sub { font-size:.7rem; font-weight:600; color:var(--muted); }
#adm-root .jus-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .jus-badge-pendente { background:var(--yellow-light); color:#b45309; }
#adm-root .jus-badge-em-anl { background:var(--purple-light); color:var(--purple); }
#adm-root .jus-badge-aprovada { background:var(--green-light); color:#16a34a; }
#adm-root .jus-badge-reprovada { background:var(--red-light); color:#dc2626; }
#adm-root .jus-prazo-ok { color:var(--green); font-weight:800; font-size:.75rem; }
#adm-root .jus-prazo-warn { color:var(--yellow); font-weight:800; font-size:.75rem; }
#adm-root .jus-prazo-venc { color:var(--red); font-weight:800; font-size:.75rem; }
#adm-root .jus-actions-cell { display:flex; align-items:center; justify-content:center; gap:.4rem; flex-wrap:wrap; }
#adm-root .jus-act-btn { display:flex; align-items:center; gap:.35rem; padding:.32rem .7rem; border-radius:8px; border:1.5px solid var(--border); background:none; font-family:'Nunito',sans-serif; font-size:.7rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .jus-act-btn.aprovar { border-color:rgba(34,197,94,.3); color:var(--green); background:var(--green-light); }
#adm-root .jus-act-btn.aprovar:hover { background:rgba(34,197,94,.2); }
#adm-root .jus-act-btn.reprovar { border-color:rgba(239,68,68,.25); color:var(--red); background:var(--red-light); }
#adm-root .jus-act-btn.reprovar:hover { background:rgba(239,68,68,.12); }
#adm-root .jus-act-btn.ver:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .jus-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; display:flex; align-items:center; justify-content:center; padding:1rem; animation:fadeIn .2s ease; }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
#adm-root .jus-modal-box { background:var(--surface); border-radius:20px; width:100%; max-width:560px; box-shadow:0 20px 60px rgba(0,0,0,.15); animation:popIn .3s cubic-bezier(.34,1.56,.64,1); overflow:hidden; display:flex; flex-direction:column; max-height:90vh; }
@keyframes popIn { from{transform:scale(.92);opacity:0} to{transform:scale(1);opacity:1} }
#adm-root .jus-modal-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .jus-modal-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .jus-modal-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .jus-modal-close:hover { color:var(--text); }
#adm-root .jus-modal-body { padding:1.6rem; overflow-y:auto; flex:1; }
#adm-root .jus-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; margin-bottom:1.2rem; }
#adm-root .jus-detail-item { background:var(--bg); border-radius:10px; padding:.7rem .9rem; }
#adm-root .jus-detail-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:3px; }
#adm-root .jus-detail-val { font-size:.85rem; font-weight:800; color:var(--text); }
#adm-root .jus-justif-text-box { background:var(--bg); border-radius:12px; padding:1rem; margin-bottom:1.2rem; }
#adm-root .jus-justif-text-label { font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:.5rem; }
#adm-root .jus-justif-text { font-size:.85rem; font-weight:600; color:var(--text); line-height:1.6; }
#adm-root .jus-resposta-field { margin-bottom:1.2rem; }
#adm-root .jus-resposta-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); display:block; margin-bottom:.4rem; }
#adm-root .jus-resposta-field textarea { width:100%; padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; resize:vertical; min-height:80px; }
#adm-root .jus-resposta-field textarea:focus { border-color:var(--indigo); }
#adm-root .jus-modal-footer { padding:1rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; align-items:center; }
#adm-root .jus-btn-aprovar { flex:1; padding:.8rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--green),#16a34a); transition:transform .14s; }
#adm-root .jus-btn-aprovar:hover:not(:disabled) { transform:translateY(-1px); }
#adm-root .jus-btn-aprovar:disabled { opacity:.5; cursor:not-allowed; }
#adm-root .jus-btn-reprovar { flex:1; padding:.8rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--red),#dc2626); transition:transform .14s; }
#adm-root .jus-btn-reprovar:hover:not(:disabled) { transform:translateY(-1px); }
#adm-root .jus-btn-reprovar:disabled { opacity:.5; cursor:not-allowed; }
#adm-root .jus-btn-fechar { padding:.8rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; }
#adm-root .jus-btn-fechar:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .jus-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .jus-toast.show { transform:translateY(0); opacity:1; }
#adm-root .jus-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }
#adm-root .jus-cselect { position:relative; }
#adm-root .jus-cselect-btn { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.65rem .9rem; border:1.5px solid var(--border); border-radius:12px; background:var(--surface); font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); cursor:pointer; transition:border-color .2s; min-width:180px; }
#adm-root .jus-cselect-btn:hover { border-color:var(--indigo); }
#adm-root .jus-cselect-btn svg { color:var(--indigo); flex-shrink:0; }
#adm-root .jus-cselect-dropdown { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:60; overflow:hidden; animation:fadeUp .15s ease; max-height:260px; overflow-y:auto; }
#adm-root .jus-cselect-option { padding:.65rem 1rem; font-size:.82rem; font-weight:600; color:var(--text); cursor:pointer; transition:background .12s; }
#adm-root .jus-cselect-option:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .jus-cselect-option.active { background:var(--indigo); color:#fff; font-weight:800; }

/* Dark mode */
#adm-root.dark .jus-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .jus-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .jus-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .jus-table-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .jus-table thead tr { background:#0f1119; }
#adm-root.dark .jus-table tbody tr { border-bottom-color:rgba(255,255,255,.04); }
#adm-root.dark .jus-table tbody tr:hover { background:rgba(255,255,255,.03); }
#adm-root.dark .jus-table-header-bar { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .jus-modal-box { background:#1a1f36; }
#adm-root.dark .jus-modal-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .jus-modal-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .jus-detail-item { background:#0f1119; }
#adm-root.dark .jus-justif-text-box { background:#0f1119; }
#adm-root.dark .jus-resposta-field textarea { background:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .jus-btn-fechar { border-color:rgba(255,255,255,.1); color:#94a3b8; }
#adm-root.dark .jus-cselect-btn { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .jus-cselect-dropdown { background:#1a1f36; border-color:rgba(255,255,255,.1); box-shadow:0 8px 24px rgba(0,0,0,.4); }
#adm-root.dark .jus-cselect-option { color:#e2e8f0; }
#adm-root.dark .jus-cselect-option:hover { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .jus-cselect-option.active { background:var(--indigo); color:#fff; }

/* Responsive */
@media (max-width: 768px) {
  #adm-root .jus-hamburger { display:flex; }
  #adm-root .jus-topbar { padding:.85rem 1rem; }
  #adm-root .jus-content { padding:1rem; }
  #adm-root .jus-page-header { flex-direction:column; align-items:flex-start; gap:.75rem; }
  #adm-root .jus-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .jus-kpi { padding:.9rem 1rem; }
  #adm-root .jus-kpi-lbl { font-size:.6rem; white-space:normal; word-break:break-word; }
  #adm-root .jus-kpi-val { font-size:1.6rem; }
  #adm-root .jus-filter-bar { flex-direction:column; align-items:stretch; }
  #adm-root .jus-search-wrap { min-width:unset; }
  #adm-root .jus-cselect { width:100%; }
  #adm-root .jus-cselect-btn { min-width:unset; width:100%; }
  #adm-root .jus-detail-grid { grid-template-columns:1fr; }
}
`;
