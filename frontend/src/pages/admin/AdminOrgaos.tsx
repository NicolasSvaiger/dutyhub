/**
 * Admin OS — Órgãos Públicos.
 * AdminGlobal: full CRUD (criar/editar contratos + órgãos vinculados).
 * AdminClinica: read-only view of contracts containing their clinics.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { contractsApi } from '../../api/contractsApi';
import { useAuth } from '../../hooks/useAuth';
import type { Contract, ContractStatus, CreateContractRequest } from '../../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const CARD_COLORS = [
  { bg: '#eef2ff', stroke: '#6366f1' },
  { bg: '#fff7ed', stroke: '#f97316' },
  { bg: '#ede9fe', stroke: '#8b5cf6' },
  { bg: '#e8faf9', stroke: '#2DBFB8' },
  { bg: '#dcfce7', stroke: '#22c55e' },
  { bg: '#fee2e2', stroke: '#ef4444' },
];

function isExpired(endDate: string): boolean {
  return new Date(endDate) < new Date();
}

function normalizeStatus(s: unknown): string {
  // Backend may return number (1,2,3) or string ('Active','Renewal','Inactive')
  if (s === 1 || s === 'Active') return 'Active';
  if (s === 2 || s === 'Renewal') return 'Renewal';
  if (s === 3 || s === 'Inactive') return 'Inactive';
  return 'Inactive';
}

/** Effective status considering expiry date */
function effectiveStatus(contract: Contract): { badge: string; label: string; isExpired: boolean } {
  const normalized = normalizeStatus(contract.status);
  if (isExpired(contract.endDate) && normalized !== 'Inactive') {
    return { badge: 'org-badge-inativo', label: 'Vencido', isExpired: true };
  }
  if (normalized === 'Active') return { badge: 'org-badge-ativo', label: contract.statusLabel || 'Ativo', isExpired: false };
  if (normalized === 'Renewal') return { badge: 'org-badge-renovacao', label: contract.statusLabel || 'Renovação', isExpired: false };
  return { badge: 'org-badge-inativo', label: contract.statusLabel || 'Inativo', isExpired: false };
}

function slaColor(pct: number): string {
  if (pct >= 85) return 'var(--green)';
  if (pct >= 70) return 'var(--yellow)';
  return 'var(--red)';
}

function formatMoney(v?: number | null): string {
  if (!v) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function formatCurrencyInput(v: string): string {
  // Remove tudo que não é dígito
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  // Converte pra centavos (últimos 2 dígitos = decimais)
  const num = parseInt(d, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyInput(formatted: string): number {
  // Remove formatação e converte de volta pra number
  return parseFloat(formatted.replace(/\./g, '').replace(',', '.')) || 0;
}

// ─── CustomSelect ─────────────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);
  return (
    <div className="org-cselect" ref={ref}>
      <button className="org-cselect-btn" type="button" onClick={() => setOpen(!open)}>
        <span>{selected?.label || '—'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="org-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`org-cselect-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>{o.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; onOpenSidebar?: () => void; }

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminOrgaos({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields — Órgão
  const [fOrganName, setFOrganName] = useState('');
  const [fOrganAcronym, setFOrganAcronym] = useState('');
  const [fOrganCnpj, setFOrganCnpj] = useState('');
  const [fOrganDept, setFOrganDept] = useState('');
  const [fOrganContactName, setFOrganContactName] = useState('');
  const [fOrganContactEmail, setFOrganContactEmail] = useState('');
  const [fOrganContactPhone, setFOrganContactPhone] = useState('');
  const [fOrganCity, setFOrganCity] = useState('');
  const [fOrganState, setFOrganState] = useState('');

  // Form fields — Contrato
  const [fContractNumber, setFContractNumber] = useState('');
  const [fMonthlyValue, setFMonthlyValue] = useState('');
  const [fStartDate, setFStartDate] = useState('');
  const [fEndDate, setFEndDate] = useState('');
  const [fMinSla, setFMinSla] = useState('');
  const [fStatus, setFStatus] = useState<ContractStatus>('Active');
  const [fNotes, setFNotes] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await contractsApi.getAll();
      setContracts(Array.isArray(data) ? data : []);
    } catch {
      // graceful — mantém lista atual
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => contracts.filter(c => {
    if (search && !c.publicOrganName.toLowerCase().includes(search.toLowerCase()) &&
        !c.contractNumber.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus) {
      const norm = normalizeStatus(c.status);
      const effStatus = isExpired(c.endDate) && norm !== 'Inactive' ? 'Inactive' : norm;
      if (effStatus !== filterStatus) return false;
    }
    return true;
  }), [contracts, search, filterStatus]);

  const kpiAtivos = contracts.filter(c => normalizeStatus(c.status) === 'Active' && !isExpired(c.endDate)).length;
  const kpiUPAs = contracts.filter(c => !isExpired(c.endDate)).reduce((s, c) => s + c.clinics.length, 0);
  // Em renovação: conta contratos com status=Renewal (independente de data — o status é intencional)
  const kpiRenovacao = contracts.filter(c => normalizeStatus(c.status) === 'Renewal').length;
  const kpiMensal = contracts.filter(c => !isExpired(c.endDate)).reduce((s, c) => s + (c.monthlyValue || 0), 0);

  function showToast(msg: string, err = false) {
    setToast(msg); setToastError(err);
    setTimeout(() => setToast(''), 3500);
  }

  function resetForm() {
    setFOrganName(''); setFOrganAcronym(''); setFOrganCnpj(''); setFOrganDept('');
    setFOrganContactName(''); setFOrganContactEmail(''); setFOrganContactPhone('');
    setFOrganCity(''); setFOrganState('');
    setFContractNumber(''); setFMonthlyValue(''); setFStartDate(''); setFEndDate('');
    setFMinSla(''); setFStatus('Active'); setFNotes('');
  }

  function openDrawer(contract?: Contract) {
    setEditingId(contract?.id ?? null);
    if (contract) {
      setFOrganName(contract.publicOrganName);
      setFOrganAcronym(contract.publicOrganAcronym || '');
      setFOrganCnpj(contract.publicOrganCnpj || '');
      setFOrganDept(contract.publicOrganDepartment || '');
      setFOrganContactName(contract.publicOrganContactName || '');
      setFOrganContactEmail(contract.publicOrganContactEmail || '');
      // Aplica máscara no telefone vindo do backend (só dígitos -> formatado)
      setFOrganContactPhone(contract.publicOrganContactPhone ? maskPhone(contract.publicOrganContactPhone) : '');
      setFOrganCity(contract.publicOrganCity || '');
      setFOrganState(contract.publicOrganState || '');
      setFContractNumber(contract.contractNumber);
      // Aplica máscara no valor vindo do backend (number -> string formatado "15.236,01")
      setFMonthlyValue(contract.monthlyValue ? formatCurrencyInput((contract.monthlyValue * 100).toString()) : '');
      setFStartDate(contract.startDate.split('T')[0]);
      setFEndDate(contract.endDate.split('T')[0]);
      setFMinSla(contract.minSlaPercent?.toString() || '');
      setFStatus(normalizeStatus(contract.status) as ContractStatus);
      setFNotes(contract.notes || '');
    } else {
      resetForm();
    }
    setDrawerOpen(true);
  }

  async function salvar() {
    if (!fOrganName.trim() || !fContractNumber.trim()) {
      showToast('Nome do órgão e nº do contrato são obrigatórios.', true); return;
    }
    setSaving(true);
    try {
      const payload: CreateContractRequest = {
        organName: fOrganName.trim(),
        organAcronym: fOrganAcronym || null,
        organCnpj: fOrganCnpj.replace(/\D/g, '') || null,
        organDepartment: fOrganDept || null,
        organContactName: fOrganContactName || null,
        organContactEmail: fOrganContactEmail || null,
        organContactPhone: fOrganContactPhone.replace(/\D/g, '') || null,
        organCity: fOrganCity || null,
        organState: fOrganState || null,
        contractNumber: fContractNumber.trim(),
        monthlyValue: fMonthlyValue ? parseCurrencyInput(fMonthlyValue) : null,
        startDate: fStartDate,
        endDate: fEndDate,
        minSlaPercent: fMinSla ? parseInt(fMinSla, 10) : null,
        status: fStatus,
        notes: fNotes || null,
      };

      let saved: Contract;
      if (editingId) {
        saved = await contractsApi.update(editingId, payload);
        // Atualiza imediatamente o item no state local
        setContracts(prev => prev.map(c => c.id === editingId ? saved : c));
        showToast('Contrato atualizado com sucesso!');
      } else {
        saved = await contractsApi.create(payload);
        // Adiciona o novo item no state local
        setContracts(prev => [saved, ...prev]);
        showToast('Contrato cadastrado com sucesso!');
      }
      setDrawerOpen(false);
    } catch (err: unknown) {
      let msg = 'Erro ao salvar contrato';
      if (err && typeof err === 'object' && 'response' in err) {
        const r = (err as { response?: { data?: { detail?: string } } }).response;
        if (r?.data?.detail) msg = r.data.detail;
      }
      showToast(msg, true);
    } finally {
      setSaving(false);
    }
  }

  const formValid = fOrganName.trim() !== '' && fContractNumber.trim() !== '';

  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORG_CSS }} />

      <div className="org-topbar">
        <div className="org-topbar-left">
          <button className="org-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="org-topbar-title">Órgãos Públicos</div>
            <div className="org-topbar-sub">Contratos e parcerias com prefeituras e secretarias</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
      </div>

      <div className="org-content">
        <div className="org-page-header">
          <div>
            <div className="org-page-title">Gestão de Contratos</div>
            <div className="org-page-sub">Prefeituras e secretarias atendidas pela OS</div>
          </div>
          {isAdminGlobal ? (
            <button className="org-btn-novo" onClick={() => openDrawer()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Novo contrato
            </button>
          ) : (
            <div className="org-readonly-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Gerenciado pela 24p7
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="org-kpi-strip">
          <div className="org-kpi indigo"><div className="org-kpi-lbl">Contratos ativos</div><div className="org-kpi-val">{loading ? '—' : kpiAtivos}</div><div className="org-kpi-sub">prefeituras atendidas</div></div>
          <div className="org-kpi teal"><div className="org-kpi-lbl">UPAs cobertas</div><div className="org-kpi-val">{loading ? '—' : kpiUPAs}</div><div className="org-kpi-sub">unidades monitoradas</div></div>
          <div className="org-kpi green"><div className="org-kpi-lbl">Valor mensal total</div><div className="org-kpi-val" style={{ fontSize: '1.2rem' }}>{loading ? '—' : formatMoney(kpiMensal)}</div><div className="org-kpi-sub">soma dos contratos</div></div>
          <div className="org-kpi yellow"><div className="org-kpi-lbl">Em renovação</div><div className="org-kpi-val">{loading ? '—' : kpiRenovacao}</div><div className="org-kpi-sub">vence em breve</div></div>
        </div>

        {/* Filtros */}
        <div className="org-filter-bar">
          <div className="org-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="org-search-input" type="text" placeholder="Buscar por nome do órgão ou nº contrato..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect value={filterStatus} onChange={setFilterStatus} options={[
            { value: '', label: 'Todos os status' },
            { value: 'Active', label: 'Ativo' },
            { value: 'Renewal', label: 'Em renovação' },
            { value: 'Inactive', label: 'Inativo' },
          ]} />
        </div>

        {/* Cards */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
            {contracts.length === 0 ? 'Nenhum contrato cadastrado.' : 'Nenhum contrato encontrado.'}
          </div>
        ) : (
          <div className="org-cards-grid">
            {filtered.map((contract, i) => {
              const color = CARD_COLORS[i % CARD_COLORS.length];
              const days = daysUntil(contract.endDate);
              const isExpiring = days <= 60 && days > 0;
              const sla = contract.minSlaPercent;
              const eff = effectiveStatus(contract);
              return (
                <div key={contract.id} className={`org-card ${eff.isExpired ? 'expired' : ''}`}>
                  <div className="org-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', flex: 1 }}>
                      <div className="org-card-icon" style={{ background: color.bg }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={eff.isExpired ? '#6b7280' : color.stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      </div>
                      <div>
                        <div className="org-card-nome">{contract.publicOrganName}</div>
                        <div className="org-card-sigla">{contract.publicOrganAcronym ? `${contract.publicOrganAcronym} · ` : ''}{contract.contractNumber}</div>
                      </div>
                    </div>
                    <span className={`org-badge ${eff.badge}`}>{eff.label}</span>
                  </div>

                  <div className="org-card-body">
                    <div className="org-info-grid">
                      <div className="org-info-item"><div className="org-info-lbl">Nº do contrato</div><div className="org-info-val">{contract.contractNumber}</div></div>
                      <div className="org-info-item"><div className="org-info-lbl">Valor mensal</div><div className="org-info-val" style={{ color: 'var(--green)' }}>{formatMoney(contract.monthlyValue)}</div></div>
                      <div className="org-info-item"><div className="org-info-lbl">Vigência</div><div className="org-info-val" style={{ fontSize: '.78rem' }}>{formatDate(contract.startDate)} – {formatDate(contract.endDate)}</div></div>
                      <div className="org-info-item"><div className="org-info-lbl">UPAs cobertas</div><div className="org-info-val">{contract.clinics.length} unidade{contract.clinics.length !== 1 ? 's' : ''}</div></div>
                      {sla && <div className="org-info-item"><div className="org-info-lbl">SLA mínimo</div><div className="org-info-val" style={{ color: slaColor(sla) }}>{sla}%</div></div>}
                    </div>
                    {contract.clinics.length > 0 && (
                      <div className="org-upas-wrap">
                        {contract.clinics.map(c => (
                          <span key={c.id} className={`org-upa-chip ${!c.isActive ? 'inactive' : ''}`}>{c.name}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="org-card-footer">
                    <div className={`org-footer-info ${eff.isExpired ? 'expired-text' : isExpiring ? 'warning' : ''}`}>
                      {eff.isExpired
                        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Vencido em {formatDate(contract.endDate)}</>
                        : isExpiring
                          ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Vence em {days} dias</>
                          : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Renova em {formatDate(contract.endDate)}</>
                      }
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      {sla && <span style={{ fontSize: '.65rem', fontWeight: 800, color: slaColor(sla) }}>SLA mín. {sla}%</span>}
                      {isAdminGlobal && (
                        <button className="org-act-btn" title="Editar" onClick={() => openDrawer(contract)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && <div className="org-overlay" onClick={() => setDrawerOpen(false)} />}
      <div className={`org-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="org-drawer-header">
          <div className="org-drawer-title">{editingId ? 'Editar contrato' : 'Novo contrato'}</div>
          <button className="org-drawer-close" onClick={() => setDrawerOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="org-drawer-body">
          {/* Órgão Público */}
          <div className="org-form-section">
            <div className="org-form-section-title">Dados do Órgão Público</div>
            <div className="org-form-row full">
              <div className="org-field"><label>Nome completo do órgão *</label><input type="text" placeholder="Ex: Prefeitura Municipal" value={fOrganName} onChange={e => setFOrganName(e.target.value)} /></div>
            </div>
            <div className="org-form-row">
              <div className="org-field"><label>Sigla</label><input type="text" placeholder="PM" value={fOrganAcronym} onChange={e => setFOrganAcronym(e.target.value)} /></div>
              <div className="org-field"><label>CNPJ</label><input type="text" placeholder="00.000.000/0000-00" value={fOrganCnpj} onChange={e => setFOrganCnpj(maskCnpj(e.target.value))} maxLength={18} /></div>
            </div>
            <div className="org-form-row full">
              <div className="org-field"><label>Secretaria / Departamento</label><input type="text" placeholder="Ex: Secretaria Municipal de Saúde" value={fOrganDept} onChange={e => setFOrganDept(e.target.value)} /></div>
            </div>
            <div className="org-form-row">
              <div className="org-field"><label>Nome do responsável</label><input type="text" placeholder="Nome completo" value={fOrganContactName} onChange={e => setFOrganContactName(e.target.value)} /></div>
              <div className="org-field"><label>E-mail</label><input type="email" placeholder="responsavel@prefeitura.gov.br" value={fOrganContactEmail} onChange={e => setFOrganContactEmail(e.target.value)} /></div>
            </div>
            <div className="org-form-row">
              <div className="org-field"><label>Telefone</label><input type="text" placeholder="(11) 99999-9999" value={fOrganContactPhone} onChange={e => setFOrganContactPhone(maskPhone(e.target.value))} /></div>
              <div className="org-field"><label>Cidade</label><input type="text" placeholder="Nome da cidade" value={fOrganCity} onChange={e => setFOrganCity(e.target.value)} /></div>
            </div>
            <div className="org-form-row">
              <div className="org-field org-field-uf"><label>UF</label><input type="text" placeholder="SP" value={fOrganState} onChange={e => setFOrganState(e.target.value.toUpperCase().slice(0,2))} maxLength={2} /></div>
            </div>
          </div>

          {/* Contrato */}
          <div className="org-form-section">
            <div className="org-form-section-title">Dados do Contrato</div>
            <div className="org-form-row">
              <div className="org-field"><label>Número do contrato *</label><input type="text" placeholder="Ex: CT-2026-0001" value={fContractNumber} onChange={e => setFContractNumber(e.target.value)} /></div>
              <div className="org-field"><label>Valor mensal (R$)</label><input type="text" placeholder="0,00" value={fMonthlyValue} onChange={e => setFMonthlyValue(formatCurrencyInput(e.target.value))} /></div>
            </div>
            <div className="org-form-row">
              <div className="org-field"><label>Início da vigência</label><input type="date" value={fStartDate} onChange={e => setFStartDate(e.target.value)} /></div>
              <div className="org-field"><label>Fim da vigência</label><input type="date" value={fEndDate} onChange={e => setFEndDate(e.target.value)} /></div>
            </div>
            <div className="org-form-row">
              <div className="org-field"><label>SLA mínimo (%)</label><input type="number" placeholder="Ex: 90" value={fMinSla} onChange={e => {
                const val = parseInt(e.target.value, 10);
                // Clamp 0-100 no onChange — previne digitação acima de 100
                if (isNaN(val)) setFMinSla('');
                else setFMinSla(Math.min(100, Math.max(0, val)).toString());
              }} min={0} max={100} /></div>
              <div className="org-field"><label>Status</label>
                <CustomSelect value={fStatus} onChange={v => setFStatus(v as ContractStatus)} options={[
                  { value: 'Active', label: 'Ativo' },
                  { value: 'Renewal', label: 'Em renovação' },
                  { value: 'Inactive', label: 'Inativo' },
                ]} />
              </div>
            </div>
            <div className="org-form-row full">
              <div className="org-field"><label>Observações</label><textarea placeholder="Cláusulas especiais, penalidades, etc." value={fNotes} onChange={e => setFNotes(e.target.value)} /></div>
            </div>
          </div>
        </div>

        <div className="org-drawer-footer">
          <button className="org-btn-cancelar" onClick={() => setDrawerOpen(false)}>Cancelar</button>
          <button className="org-btn-salvar" disabled={!formValid || saving} onClick={salvar}>
            {saving ? 'Salvando...' : editingId ? 'Atualizar contrato' : 'Salvar contrato'}
          </button>
        </div>
      </div>

      <div className={`org-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const ORG_CSS = `
#adm-root .org-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .org-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .org-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .org-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .org-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .org-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .org-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .org-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .org-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .org-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .org-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s; }
#adm-root .org-btn-novo:hover { transform:translateY(-1px); }
#adm-root .org-readonly-badge { display:flex; align-items:center; gap:.4rem; background:var(--indigo-light); border:1.5px solid rgba(99,102,241,.2); border-radius:10px; padding:.5rem .9rem; font-size:.72rem; font-weight:800; color:var(--indigo); }
#adm-root .org-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .org-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .org-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .org-kpi.indigo::after{background:var(--indigo);} #adm-root .org-kpi.green::after{background:var(--green);} #adm-root .org-kpi.teal::after{background:var(--teal);} #adm-root .org-kpi.yellow::after{background:var(--yellow);}
#adm-root .org-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .org-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .org-kpi.indigo .org-kpi-val{color:var(--indigo);} #adm-root .org-kpi.teal .org-kpi-val{color:var(--teal);} #adm-root .org-kpi.green .org-kpi-val{color:var(--green);} #adm-root .org-kpi.yellow .org-kpi-val{color:var(--yellow);}
#adm-root .org-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .org-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .org-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .org-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .org-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .org-search-input:focus { border-color:var(--indigo); }
#adm-root .org-cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:1.2rem; }
#adm-root .org-card { background:var(--surface); border-radius:20px; border:1.5px solid var(--border); overflow:hidden; transition:transform .15s,box-shadow .15s; }
#adm-root .org-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px rgba(99,102,241,.1); }
#adm-root .org-card-header { padding:1.2rem 1.4rem; display:flex; align-items:flex-start; justify-content:space-between; gap:.8rem; }
#adm-root .org-card-icon { width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
#adm-root .org-card-nome { font-family:'Nunito',sans-serif; font-size:1rem; font-weight:900; color:var(--text); line-height:1.2; }
#adm-root .org-card-sigla { font-size:.7rem; font-weight:700; color:var(--muted); margin-top:3px; }
#adm-root .org-badge { display:inline-flex; align-items:center; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .org-badge-ativo { background:var(--green-light); color:#16a34a; }
#adm-root .org-badge-inativo { background:var(--red-light); color:#dc2626; }
#adm-root .org-badge-renovacao { background:var(--yellow-light); color:#b45309; }
#adm-root .org-card-body { padding:.9rem 1.4rem 1rem; }
#adm-root .org-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; margin-bottom:.9rem; }
#adm-root .org-info-item { background:var(--bg); border-radius:10px; padding:.5rem .7rem; }
#adm-root .org-info-lbl { font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:2px; }
#adm-root .org-info-val { font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:900; color:var(--text); }
#adm-root .org-upas-wrap { display:flex; gap:.35rem; flex-wrap:wrap; }
#adm-root .org-upa-chip { font-size:.68rem; font-weight:800; padding:.25rem .65rem; border-radius:20px; background:var(--indigo-light); color:var(--indigo); }
#adm-root .org-upa-chip.inactive { background:var(--bg); color:var(--muted); opacity:.6; }
#adm-root .org-card-footer { padding:.8rem 1.4rem; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .org-footer-info { display:flex; align-items:center; gap:.35rem; font-size:.7rem; font-weight:700; color:var(--muted); }
#adm-root .org-footer-info.warning { color:var(--yellow); }
#adm-root .org-footer-info.expired-text { color:var(--red); }
#adm-root .org-card.expired { opacity:.7; }
#adm-root .org-card.expired .org-card-nome { color:var(--muted); }
#adm-root .org-act-btn { width:30px; height:30px; border-radius:8px; border:1.5px solid var(--border); background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted); transition:all .15s; }
#adm-root .org-act-btn:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .org-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; }
#adm-root .org-drawer { position:fixed; top:0; right:0; bottom:0; width:560px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .org-drawer.open { transform:translateX(0); }
#adm-root .org-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .org-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .org-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .org-drawer-close:hover { color:var(--text); }
#adm-root .org-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .org-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; flex-shrink:0; }
#adm-root .org-form-section { margin-bottom:1.4rem; }
#adm-root .org-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--indigo); margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid var(--indigo-light); }
#adm-root .org-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; margin-bottom:.9rem; }
#adm-root .org-form-row.full { grid-template-columns:1fr; }
#adm-root .org-field-uf { max-width:120px; }
#adm-root .org-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .org-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .org-field input, #adm-root .org-field textarea { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .org-field input:focus, #adm-root .org-field textarea:focus { border-color:var(--indigo); background:#fff; }
#adm-root .org-field textarea { resize:vertical; min-height:70px; }
#adm-root .org-btn-salvar { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); box-shadow:0 3px 12px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .org-btn-salvar:hover { transform:translateY(-1px); }
#adm-root .org-btn-salvar:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
#adm-root .org-btn-cancelar { padding:.85rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; }
#adm-root .org-btn-cancelar:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .org-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .org-toast.show { transform:translateY(0); opacity:1; }
#adm-root .org-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }
#adm-root .org-cselect { position:relative; }
#adm-root .org-cselect-btn { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; background:var(--bg); font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); cursor:pointer; transition:border-color .2s; white-space:nowrap; width:100%; }
#adm-root .org-cselect-btn:hover { border-color:var(--indigo); }
#adm-root .org-cselect-btn svg { color:var(--indigo); flex-shrink:0; }
#adm-root .org-cselect-dropdown { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:60; overflow:hidden; animation:fadeUp .15s ease; }
#adm-root .org-cselect-option { padding:.65rem 1rem; font-size:.82rem; font-weight:600; color:var(--text); cursor:pointer; transition:background .12s; }
#adm-root .org-cselect-option:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .org-cselect-option.active { background:var(--indigo); color:#fff; font-weight:800; }
#adm-root.dark .org-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .org-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .org-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .org-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .org-info-item { background:#0f1119; }
#adm-root.dark .org-card-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .org-drawer { background:#1a1f36; }
#adm-root.dark .org-drawer-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .org-drawer-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .org-field input, #adm-root.dark .org-field textarea { background-color:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .org-field input:focus, #adm-root.dark .org-field textarea:focus { border-color:var(--indigo); }
#adm-root.dark .org-field input::placeholder, #adm-root.dark .org-field textarea::placeholder { color:#64748b; }
#adm-root.dark .org-cselect-btn { background:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .org-cselect-dropdown { background:#1a1f36; border-color:rgba(255,255,255,.1); }
#adm-root.dark .org-cselect-option { color:#e2e8f0; }
#adm-root.dark .org-cselect-option:hover { background:rgba(99,102,241,.15); color:#a5b4fc; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .org-hamburger { display:flex; }
  #adm-root .org-topbar { padding:.85rem 1rem; }
  #adm-root .org-content { padding:1rem; overflow-y:auto; }
  #adm-root .org-page-header { flex-direction:column; align-items:flex-start; gap:.75rem; }
  #adm-root .org-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .org-kpi { padding:.9rem 1rem; }
  #adm-root .org-kpi-lbl { font-size:.6rem; white-space:normal; word-break:break-word; }
  #adm-root .org-kpi-val { font-size:1.6rem; }
  #adm-root .org-filter-bar { flex-direction:column; align-items:stretch; gap:.6rem; }
  #adm-root .org-search-wrap { min-width:unset; }
  #adm-root .org-cselect { min-width:unset; width:100%; }
  #adm-root .org-cards-grid { grid-template-columns:1fr; }
  #adm-root .org-drawer { width:100vw; }
}
@media (max-width: 480px) {
  #adm-root .org-kpi-strip { gap:.5rem; }
  #adm-root .org-kpi { padding:.75rem .85rem; }
  #adm-root .org-kpi-val { font-size:1.4rem; }
}
`;
