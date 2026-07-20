/**
 * Admin OS — Gestão de Substituições.
 * Replicates mock at /originais/OS/admin-substituicoes.html.
 * AdminGlobal e AdminClinica (própria UPA) podem registrar e designar substitutos.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { substitutionsApi } from '../../api/substitutionsApi';
import { clinicsApi } from '../../api/clinicsApi';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import type { Clinic, User, Substitution, SubstitutionReasonType } from '../../types';
import { formatShortDateBR } from '../../utils/dateTimeBR';

// ─── CustomSelect ─────────────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
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
    <div className="subst-cselect" ref={ref}>
      <button className="subst-cselect-btn" type="button" onClick={() => setOpen(!open)}>
        <span style={{ color: selected ? 'inherit' : 'var(--muted)' }}>{selected?.label || placeholder || 'Selecione...'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="subst-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`subst-cselect-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TURNOS = [
  { key: 'manha', label: 'Manhã (07h–19h)', startTime: '07:00:00', endTime: '19:00:00' },
  { key: 'tarde', label: 'Tarde (13h–01h)', startTime: '13:00:00', endTime: '01:00:00' },
  { key: 'noite', label: 'Noite (19h–07h)', startTime: '19:00:00', endTime: '07:00:00' },
];

const MOTIVOS: { value: SubstitutionReasonType; label: string }[] = [
  { value: 'UnannouncedAbsence', label: 'Ausência não comunicada' },
  { value: 'AdvanceNotice', label: 'Aviso antecipado' },
  { value: 'ShiftSwap', label: 'Troca de turno' },
  { value: 'MedicalLeave', label: 'Licença médica' },
  { value: 'MedicalCertificate', label: 'Atestado' },
];

const CORES = ['#6366f1', '#2DBFB8', '#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444', '#0f766e', '#7c3aed'];

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CORES[hash % CORES.length];
}

function formatDate(iso: string) {
  return formatShortDateBR(iso);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; onOpenSidebar?: () => void; }

export function AdminSubstituicoes({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');
  const canManage = isAdminGlobal || (authUser?.roles ?? []).includes('AdminClinica');

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClinic, setFilterClinic] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'assign'>('create');
  const [assignTarget, setAssignTarget] = useState<Substitution | null>(null);

  // Create form fields
  const [fClinicId, setFClinicId] = useState('');
  const [fShiftDate, setFShiftDate] = useState('');
  const [fTurnoKey, setFTurnoKey] = useState(TURNOS[0].key);
  const [fReasonType, setFReasonType] = useState<SubstitutionReasonType>('UnannouncedAbsence');
  const [fAbsentUserId, setFAbsentUserId] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fSubstituteUserId, setFSubstituteUserId] = useState<string | null>(null);

  function loadAll() {
    setLoading(true);
    return Promise.all([
      clinicsApi.getAll().catch(() => []),
      usersApi.getAll().catch(() => []),
      substitutionsApi.getAll().catch(() => []),
    ]).then(([c, u, s]) => {
      const cl = Array.isArray(c) ? c : [];
      setClinics(cl);
      setUsers(Array.isArray(u) ? u : []);
      setSubstitutions(Array.isArray(s) ? s : []);
      if (cl.length > 0 && !fClinicId) setFClinicId(cl[0].id);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { loadAll(); }, []);

  const doctors = useMemo(() => {
    return users.filter(u => {
      const pt = u.professionalType;
      const roles = u.roles || [];
      return pt === 'Medico' || pt === 'Enfermeiro' || roles.some(r => r.role === 'Medico' || r.role === 'Enfermeiro');
    });
  }, [users]);

  function doctorLabel(u: User) {
    return `${u.name}${u.registrationNumber ? ` – ${u.registrationNumber}` : ''}`;
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpiTotal = substitutions.length;
  const kpiConfirmadas = substitutions.filter(s => s.status === 'Confirmed').length;
  const kpiPendentes = substitutions.filter(s => s.status === 'Pending').length;
  const kpiUrgentes = substitutions.filter(s => s.isUrgent).length;

  // ── Filtered / sorted list ──────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = substitutions.filter(s => {
      if (search) {
        const q = search.toLowerCase();
        const matches = s.absentUserName.toLowerCase().includes(q) ||
          s.clinicName.toLowerCase().includes(q) ||
          (s.substituteUserName ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (filterStatus === 'urgente' && !s.isUrgent) return false;
      if (filterStatus === 'pendente' && !(s.status === 'Pending' && !s.isUrgent)) return false;
      if (filterStatus === 'confirmada' && s.status !== 'Confirmed') return false;
      if (filterClinic && s.clinicId !== filterClinic) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      const weight = (st: string) => st === 'Pending' ? 0 : st === 'Confirmed' ? 1 : 2;
      if (weight(a.status) !== weight(b.status)) return weight(a.status) - weight(b.status);
      return new Date(b.shiftDate).getTime() - new Date(a.shiftDate).getTime();
    });
    return list;
  }, [substitutions, search, filterStatus, filterClinic]);

  function showToast(msg: string, err = false) {
    setToast(msg); setToastError(err);
    setTimeout(() => setToast(''), 3500);
  }

  function openCreateDrawer() {
    setDrawerMode('create');
    setAssignTarget(null);
    setFClinicId(clinics[0]?.id ?? '');
    setFShiftDate('');
    setFTurnoKey(TURNOS[0].key);
    setFReasonType('UnannouncedAbsence');
    setFAbsentUserId('');
    setFNotes('');
    setFSubstituteUserId(null);
    setDrawerOpen(true);
  }

  function openAssignDrawer(sub: Substitution) {
    setDrawerMode('assign');
    setAssignTarget(sub);
    setFSubstituteUserId(sub.substituteUserId ?? null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function confirmCreate() {
    if (!fClinicId || !fShiftDate || !fAbsentUserId) {
      showToast('Preencha UPA, data e médico ausente.', true);
      return;
    }
    const turno = TURNOS.find(t => t.key === fTurnoKey) ?? TURNOS[0];
    setSaving(true);
    try {
      await substitutionsApi.create({
        clinicId: fClinicId,
        shiftDate: fShiftDate + 'T00:00:00Z',
        shiftLabel: turno.label,
        shiftStartTime: turno.startTime,
        shiftEndTime: turno.endTime,
        reasonType: fReasonType,
        notes: fNotes || null,
        absentUserId: fAbsentUserId,
        substituteUserId: fSubstituteUserId,
      });
      await loadAll();
      setDrawerOpen(false);
      showToast('Substituição registrada com sucesso!');
    } catch {
      showToast('Erro ao registrar substituição. Tente novamente.', true);
    } finally {
      setSaving(false);
    }
  }

  async function confirmAssign() {
    if (!assignTarget || !fSubstituteUserId) {
      showToast('Selecione um substituto.', true);
      return;
    }
    setSaving(true);
    try {
      await substitutionsApi.assignSubstitute(assignTarget.id, { substituteUserId: fSubstituteUserId });
      await loadAll();
      setDrawerOpen(false);
      showToast('Substituto designado com sucesso!');
    } catch {
      showToast('Erro ao designar substituto. Tente novamente.', true);
    } finally {
      setSaving(false);
    }
  }

  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  const availableSubstitutes = useMemo(() => {
    const absentId = drawerMode === 'create' ? fAbsentUserId : assignTarget?.absentUserId;
    return doctors.filter(d => d.id !== absentId);
  }, [doctors, drawerMode, fAbsentUserId, assignTarget]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SUBST_CSS }} />

      <div className="subst-topbar">
        <div className="subst-topbar-left">
          <button className="subst-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="subst-topbar-title">Gestão de Substituições</div>
            <div className="subst-topbar-sub">Registre e gerencie trocas e reposições de plantões</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
      </div>

      <div className="subst-content">
        <div className="subst-page-header">
          <div>
            <div className="subst-page-title">Substituições de Plantão</div>
            <div className="subst-page-sub">Vincule cada substituição ao plantão original para rastreabilidade</div>
          </div>
          {canManage ? (
            <button className="subst-btn-novo" onClick={openCreateDrawer}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nova substituição
            </button>
          ) : (
            <div className="subst-readonly-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Somente leitura
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="subst-kpi-strip">
          <div className="subst-kpi indigo"><div className="subst-kpi-lbl">Total no mês</div><div className="subst-kpi-val">{loading ? '—' : kpiTotal}</div><div className="subst-kpi-sub">substituições registradas</div></div>
          <div className="subst-kpi green"><div className="subst-kpi-lbl">Confirmadas</div><div className="subst-kpi-val">{loading ? '—' : kpiConfirmadas}</div><div className="subst-kpi-sub">substituto definido</div></div>
          <div className="subst-kpi yellow"><div className="subst-kpi-lbl">Pendentes</div><div className="subst-kpi-val">{loading ? '—' : kpiPendentes}</div><div className="subst-kpi-sub">aguardando substituto</div></div>
          <div className="subst-kpi orange"><div className="subst-kpi-lbl">Urgentes</div><div className="subst-kpi-val">{loading ? '—' : kpiUrgentes}</div><div className="subst-kpi-sub">plantão hoje sem cobertura</div></div>
        </div>

        {/* Filtros */}
        <div className="subst-filter-bar">
          <div className="subst-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="subst-search-input" type="text" placeholder="Buscar por médico ou UPA..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'urgente', label: 'Urgente' },
              { value: 'pendente', label: 'Pendente' },
              { value: 'confirmada', label: 'Confirmada' },
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

        {/* Lista */}
        <div className="subst-list">
          {loading ? (
            <div className="subst-empty">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="subst-empty">Nenhuma substituição encontrada.</div>
          ) : filtered.map(s => {
            const cardClass = s.isUrgent ? 'urgente' : s.status === 'Confirmed' ? 'confirmada' : 'pendente';
            return (
              <div key={s.id} className={`subst-card ${cardClass}`}>
                <div className="subst-header">
                  <div className="subst-header-info">
                    <div className="subst-id">SUB-{s.id.slice(0, 8).toUpperCase()}</div>
                    <div className="subst-titulo">{s.reasonLabel} — Plantão {formatDate(s.shiftDate)}</div>
                    <div className="subst-meta">
                      <span>{s.clinicName} · {s.shiftLabel}</span>
                      {s.isUrgent && <span className="subst-badge subst-badge-urgente">🔴 Urgente</span>}
                      {!s.isUrgent && s.status === 'Pending' && <span className="subst-badge subst-badge-pendente">Pendente</span>}
                      {s.status === 'Confirmed' && <span className="subst-badge subst-badge-confirmada">✓ Confirmada</span>}
                      {s.status === 'Cancelled' && <span className="subst-badge subst-badge-cancelada">Cancelada</span>}
                    </div>
                  </div>
                </div>
                <div className="subst-body">
                  <div className="subst-col">
                    <div className="subst-col-label">Médico ausente</div>
                    <div className="subst-med-pair">
                      <div className="subst-med-mini-av" style={{ background: colorFor(s.absentUserId) }}>{initials(s.absentUserName)}</div>
                      <div><div className="subst-med-mini-name">{s.absentUserName}</div><div className="subst-med-mini-crm">{s.absentUserRegistrationNumber || '—'}</div></div>
                    </div>
                  </div>
                  <div className="subst-arrow-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  </div>
                  <div className="subst-col">
                    <div className="subst-col-label">{s.substituteUserId ? 'Substituto designado' : 'Substituto'}</div>
                    {s.substituteUserId ? (
                      <div className="subst-med-pair">
                        <div className="subst-med-mini-av" style={{ background: colorFor(s.substituteUserId) }}>{initials(s.substituteUserName || '?')}</div>
                        <div><div className="subst-med-mini-name">{s.substituteUserName}</div><div className="subst-med-mini-crm">{s.substituteUserRegistrationNumber || '—'}</div></div>
                      </div>
                    ) : (
                      <>
                        <div style={{ color: s.isUrgent ? 'var(--red)' : 'var(--yellow)', fontSize: '.82rem', fontWeight: 800 }}>
                          {s.isUrgent ? '⚠ Não definido' : '⏳ Aguardando'}
                        </div>
                        <div className="subst-col-sub">{s.isUrgent ? 'Turno descoberto agora' : 'Nenhum designado ainda'}</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="subst-footer">
                  <div className="subst-footer-info">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {s.notes ? `Motivo: ${s.notes}` : `Motivo: ${s.reasonLabel}`}
                  </div>
                  {canManage && (
                    <div className="subst-actions">
                      {s.status === 'Pending' && (
                        <button className="subst-act-btn confirm" onClick={() => openAssignDrawer(s)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Designar substituto
                        </button>
                      )}
                      {s.status === 'Confirmed' && (
                        <button className="subst-act-btn edit" onClick={() => openAssignDrawer(s)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Editar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`subst-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>

      {/* Drawer */}
      {drawerOpen && <div className="subst-overlay" onClick={closeDrawer} />}
      <div className={`subst-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="subst-drawer-header">
          <div className="subst-drawer-title">{drawerMode === 'create' ? 'Nova substituição' : 'Designar substituto'}</div>
          <button className="subst-drawer-close" onClick={closeDrawer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="subst-drawer-body">
          {drawerMode === 'create' ? (
            <>
              <div className="subst-form-section">
                <div className="subst-form-section-title">Plantão original</div>
                <div className="subst-form-row">
                  <div className="subst-field">
                    <label>UPA</label>
                    <CustomSelect value={fClinicId} onChange={setFClinicId} options={clinics.map(c => ({ value: c.id, label: c.name }))} />
                  </div>
                  <div className="subst-field">
                    <label>Data do plantão</label>
                    <input type="date" value={fShiftDate} onChange={e => setFShiftDate(e.target.value)} />
                  </div>
                </div>
                <div className="subst-form-row">
                  <div className="subst-field">
                    <label>Turno</label>
                    <CustomSelect value={fTurnoKey} onChange={setFTurnoKey} options={TURNOS.map(t => ({ value: t.key, label: t.label }))} />
                  </div>
                  <div className="subst-field">
                    <label>Tipo de ocorrência</label>
                    <CustomSelect value={fReasonType} onChange={v => setFReasonType(v as SubstitutionReasonType)} options={MOTIVOS} />
                  </div>
                </div>
                <div className="subst-form-row full">
                  <div className="subst-field">
                    <label>Médico ausente</label>
                    <CustomSelect
                      value={fAbsentUserId}
                      onChange={setFAbsentUserId}
                      placeholder="Selecione..."
                      options={doctors.map(d => ({ value: d.id, label: doctorLabel(d) }))}
                    />
                  </div>
                </div>
                <div className="subst-form-row full">
                  <div className="subst-field">
                    <label>Motivo / Observação</label>
                    <textarea placeholder="Descreva o motivo da ausência ou substituição..." value={fNotes} onChange={e => setFNotes(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="subst-form-section">
                <div className="subst-form-section-title">Médicos disponíveis para substituição</div>
                <p style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '.8rem' }}>Selecione o profissional que irá cobrir o plantão (opcional agora).</p>
                <div className="subst-disponiveis">
                  {availableSubstitutes.map(d => (
                    <div key={d.id} className={`subst-disp-item ${fSubstituteUserId === d.id ? 'selected' : ''}`} onClick={() => setFSubstituteUserId(prev => prev === d.id ? null : d.id)}>
                      <div className="subst-disp-av" style={{ background: colorFor(d.id) }}>{initials(d.name)}</div>
                      <div style={{ flex: 1 }}><div className="subst-disp-name">{d.name}</div><div className="subst-disp-info">{d.registrationNumber || '—'}</div></div>
                      <div className="subst-disp-badge">Disponível</div>
                    </div>
                  ))}
                  {availableSubstitutes.length === 0 && <div style={{ padding: '.8rem', fontSize: '.75rem', color: 'var(--muted)' }}>Nenhum profissional disponível</div>}
                </div>
              </div>
            </>
          ) : (
            <>
              {assignTarget && (
                <div className="subst-form-section">
                  <div className="subst-form-section-title">Plantão</div>
                  <div className="subst-modal-field">
                    <div className="subst-modal-field-label">Plantão</div>
                    <div className="subst-modal-field-readonly">
                      <div style={{ fontWeight: 700 }}>{assignTarget.clinicName} — {assignTarget.shiftLabel}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{formatDate(assignTarget.shiftDate)} · Ausente: {assignTarget.absentUserName}</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="subst-form-section">
                <div className="subst-form-section-title">Médicos disponíveis para substituição</div>
                <div className="subst-disponiveis">
                  {availableSubstitutes.map(d => (
                    <div key={d.id} className={`subst-disp-item ${fSubstituteUserId === d.id ? 'selected' : ''}`} onClick={() => setFSubstituteUserId(d.id)}>
                      <div className="subst-disp-av" style={{ background: colorFor(d.id) }}>{initials(d.name)}</div>
                      <div style={{ flex: 1 }}><div className="subst-disp-name">{d.name}</div><div className="subst-disp-info">{d.registrationNumber || '—'}</div></div>
                      <div className="subst-disp-badge">Disponível</div>
                    </div>
                  ))}
                  {availableSubstitutes.length === 0 && <div style={{ padding: '.8rem', fontSize: '.75rem', color: 'var(--muted)' }}>Nenhum profissional disponível</div>}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="subst-drawer-footer">
          <button className="subst-btn-cancelar" onClick={closeDrawer}>Cancelar</button>
          {drawerMode === 'create' ? (
            <button className="subst-btn-salvar" disabled={saving || !fClinicId || !fShiftDate || !fAbsentUserId} onClick={confirmCreate}>
              {saving ? 'Salvando...' : 'Confirmar substituição'}
            </button>
          ) : (
            <button className="subst-btn-salvar" disabled={saving || !fSubstituteUserId} onClick={confirmAssign}>
              {saving ? 'Salvando...' : 'Confirmar substituição'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const SUBST_CSS = `
#adm-root .subst-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .subst-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .subst-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .subst-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .subst-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .subst-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .subst-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .subst-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .subst-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .subst-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .subst-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s; }
#adm-root .subst-btn-novo:hover { transform:translateY(-1px); }
#adm-root .subst-readonly-badge { display:flex; align-items:center; gap:.4rem; background:var(--indigo-light); border:1.5px solid rgba(99,102,241,.2); border-radius:10px; padding:.5rem .9rem; font-size:.72rem; font-weight:800; color:var(--indigo); }
#adm-root .subst-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .subst-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .subst-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .subst-kpi.indigo::after{background:var(--indigo);} #adm-root .subst-kpi.green::after{background:var(--green);} #adm-root .subst-kpi.yellow::after{background:var(--yellow);} #adm-root .subst-kpi.orange::after{background:var(--orange);}
#adm-root .subst-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .subst-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .subst-kpi.indigo .subst-kpi-val{color:var(--indigo);} #adm-root .subst-kpi.green .subst-kpi-val{color:var(--green);} #adm-root .subst-kpi.yellow .subst-kpi-val{color:var(--yellow);} #adm-root .subst-kpi.orange .subst-kpi-val{color:var(--orange);}
#adm-root .subst-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .subst-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .subst-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .subst-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .subst-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .subst-search-input:focus { border-color:var(--indigo); }
#adm-root .subst-list { display:flex; flex-direction:column; gap:1rem; }
#adm-root .subst-empty { padding:2.5rem; text-align:center; color:var(--muted); font-weight:700; background:var(--surface); border-radius:18px; border:1.5px solid var(--border); }
#adm-root .subst-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; transition:box-shadow .15s; }
#adm-root .subst-card:hover { box-shadow:0 6px 20px rgba(99,102,241,.1); }
#adm-root .subst-card.urgente { border-left:4px solid var(--red); }
#adm-root .subst-card.confirmada { border-left:4px solid var(--green); }
#adm-root .subst-card.pendente { border-left:4px solid var(--yellow); }
#adm-root .subst-header { padding:1rem 1.4rem; display:flex; align-items:center; gap:1rem; border-bottom:1px solid var(--border); }
#adm-root .subst-header-info { flex:1; }
#adm-root .subst-id { font-size:.65rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
#adm-root .subst-titulo { font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:900; color:var(--text); margin-top:2px; }
#adm-root .subst-meta { font-size:.72rem; font-weight:600; color:var(--muted); margin-top:3px; display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
#adm-root .subst-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .subst-badge-urgente { background:var(--red-light); color:#dc2626; }
#adm-root .subst-badge-confirmada { background:var(--green-light); color:#16a34a; }
#adm-root .subst-badge-pendente { background:var(--yellow-light); color:#b45309; }
#adm-root .subst-badge-cancelada { background:var(--bg); color:var(--muted); }
#adm-root .subst-body { padding:1rem 1.4rem; display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; }
#adm-root .subst-col { display:flex; flex-direction:column; gap:.3rem; }
#adm-root .subst-col-label { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .subst-col-sub { font-size:.7rem; font-weight:600; color:var(--muted); }
#adm-root .subst-arrow-icon { display:flex; align-items:center; justify-content:center; color:var(--muted); }
#adm-root .subst-med-pair { display:flex; align-items:center; gap:.6rem; }
#adm-root .subst-med-mini-av { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.6rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .subst-med-mini-name { font-size:.78rem; font-weight:800; color:var(--text); line-height:1.2; }
#adm-root .subst-med-mini-crm { font-size:.65rem; font-weight:600; color:var(--muted); }
#adm-root .subst-footer { padding:.7rem 1.4rem; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:.8rem; flex-wrap:wrap; }
#adm-root .subst-footer-info { font-size:.7rem; font-weight:600; color:var(--muted); display:flex; align-items:center; gap:.4rem; }
#adm-root .subst-actions { display:flex; gap:.4rem; }
#adm-root .subst-act-btn { display:flex; align-items:center; gap:.35rem; padding:.35rem .8rem; border-radius:8px; border:1.5px solid var(--border); background:none; font-family:'Nunito',sans-serif; font-size:.72rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .subst-act-btn.confirm { border-color:rgba(34,197,94,.3); color:var(--green); background:var(--green-light); }
#adm-root .subst-act-btn.confirm:hover { background:rgba(34,197,94,.2); }
#adm-root .subst-act-btn.edit:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .subst-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .subst-toast.show { transform:translateY(0); opacity:1; }
#adm-root .subst-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }
#adm-root .subst-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; }
#adm-root .subst-drawer { position:fixed; top:0; right:0; bottom:0; width:520px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .subst-drawer.open { transform:translateX(0); }
#adm-root .subst-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .subst-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .subst-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .subst-drawer-close:hover { color:var(--text); }
#adm-root .subst-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .subst-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; flex-shrink:0; }
#adm-root .subst-form-section { margin-bottom:1.4rem; }
#adm-root .subst-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--indigo); margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid var(--indigo-light); }
#adm-root .subst-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; margin-bottom:.9rem; }
#adm-root .subst-form-row.full { grid-template-columns:1fr; }
#adm-root .subst-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .subst-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .subst-field input, #adm-root .subst-field textarea { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .subst-field input:focus, #adm-root .subst-field textarea:focus { border-color:var(--indigo); background:#fff; }
#adm-root .subst-field textarea { resize:vertical; min-height:72px; }
#adm-root .subst-disponiveis { display:flex; flex-direction:column; gap:.4rem; }
#adm-root .subst-disp-item { display:flex; align-items:center; gap:.7rem; padding:.6rem .8rem; background:var(--bg); border-radius:10px; cursor:pointer; transition:all .15s; border:1.5px solid transparent; }
#adm-root .subst-disp-item:hover { background:var(--indigo-light); border-color:var(--indigo); }
#adm-root .subst-disp-item.selected { background:var(--indigo-light); border-color:var(--indigo); }
#adm-root .subst-disp-av { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.6rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .subst-disp-name { font-size:.8rem; font-weight:800; color:var(--text); flex:1; }
#adm-root .subst-disp-info { font-size:.65rem; font-weight:600; color:var(--muted); }
#adm-root .subst-disp-badge { font-size:.62rem; font-weight:800; padding:.18rem .55rem; border-radius:10px; background:var(--green-light); color:#16a34a; }
#adm-root .subst-modal-field { margin-bottom:.9rem; }
#adm-root .subst-modal-field-label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:.4rem; }
#adm-root .subst-modal-field-readonly { padding:.7rem .9rem; border-radius:10px; background:var(--bg); }
#adm-root .subst-btn-salvar { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); box-shadow:0 3px 12px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .subst-btn-salvar:hover { transform:translateY(-1px); }
#adm-root .subst-btn-salvar:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
#adm-root .subst-btn-cancelar { padding:.85rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; }
#adm-root .subst-btn-cancelar:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .subst-cselect { position:relative; }
#adm-root .subst-cselect-btn { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; background:var(--bg); font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); cursor:pointer; transition:border-color .2s; width:100%; }
#adm-root .subst-filter-bar .subst-cselect-btn { background:var(--surface); border-radius:12px; }
#adm-root .subst-cselect-btn:hover { border-color:var(--indigo); }
#adm-root .subst-cselect-btn svg { color:var(--indigo); flex-shrink:0; }
#adm-root .subst-cselect-dropdown { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:60; overflow:hidden; animation:fadeUp .15s ease; max-height:260px; overflow-y:auto; }
#adm-root .subst-cselect-option { padding:.65rem 1rem; font-size:.82rem; font-weight:600; color:var(--text); cursor:pointer; transition:background .12s; }
#adm-root .subst-cselect-option:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .subst-cselect-option.active { background:var(--indigo); color:#fff; font-weight:800; }
#adm-root.dark .subst-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .subst-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .subst-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .subst-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .subst-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .subst-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .subst-empty { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .subst-drawer { background:#1a1f36; }
#adm-root.dark .subst-drawer-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .subst-drawer-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .subst-field input, #adm-root.dark .subst-field textarea { background-color:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .subst-disp-item { background:#0f1119; }
#adm-root.dark .subst-disp-item:hover, #adm-root.dark .subst-disp-item.selected { background:rgba(99,102,241,.15); }
#adm-root.dark .subst-modal-field-readonly { background:#0f1119; }
#adm-root.dark .subst-cselect-btn { background:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .subst-filter-bar .subst-cselect-btn { background:#1a1f36; }
#adm-root.dark .subst-cselect-dropdown { background:#1a1f36; border-color:rgba(255,255,255,.1); box-shadow:0 8px 24px rgba(0,0,0,.4); }
#adm-root.dark .subst-cselect-option { color:#e2e8f0; }
#adm-root.dark .subst-cselect-option:hover { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .subst-cselect-option.active { background:var(--indigo); color:#fff; }
#adm-root.dark .subst-btn-cancelar { border-color:rgba(255,255,255,.1); color:#94a3b8; }
#adm-root.dark .subst-form-section-title { border-bottom-color:rgba(99,102,241,.2); }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .subst-hamburger { display:flex; }
  #adm-root .subst-topbar { padding:.85rem 1rem; }
  #adm-root .subst-content { padding:1rem; }
  #adm-root .subst-page-header { flex-direction:column; align-items:flex-start; gap:.75rem; }
  #adm-root .subst-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .subst-kpi { padding:.9rem 1rem; }
  #adm-root .subst-kpi-lbl { font-size:.6rem; white-space:normal; word-break:break-word; }
  #adm-root .subst-kpi-val { font-size:1.6rem; }
  #adm-root .subst-filter-bar { flex-direction:column; align-items:stretch; gap:.6rem; }
  #adm-root .subst-search-wrap { min-width:unset; }
  #adm-root .subst-cselect { min-width:unset; width:100%; }
  #adm-root .subst-body { grid-template-columns:1fr; gap:.6rem; }
  #adm-root .subst-arrow-icon { transform:rotate(90deg); }
  #adm-root .subst-form-row { grid-template-columns:1fr; }
  #adm-root .subst-drawer { width:100vw; }
}

@media (max-width: 480px) {
  #adm-root .subst-kpi-strip { gap:.5rem; }
  #adm-root .subst-kpi { padding:.75rem .85rem; }
  #adm-root .subst-kpi-val { font-size:1.4rem; }
}
`;
