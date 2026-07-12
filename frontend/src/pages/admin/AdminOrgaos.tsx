/**
 * Admin OS — Órgãos Públicos (read-only).
 * Shows contracts between the OS and public organs (prefeituras).
 * AdminOS sees only contracts that contain their clinics.
 * AdminGlobal sees all.
 */
import { useState, useEffect, useMemo } from 'react';
import { contractsApi } from '../../api/contractsApi';
import type { Contract, ContractStatus } from '../../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const CARD_COLORS = [
  { bg: '#eef2ff', stroke: '#6366f1' },
  { bg: '#fff7ed', stroke: '#f97316' },
  { bg: '#ede9fe', stroke: '#8b5cf6' },
  { bg: '#e8faf9', stroke: '#2DBFB8' },
  { bg: '#dcfce7', stroke: '#22c55e' },
  { bg: '#fee2e2', stroke: '#ef4444' },
];

function statusBadgeClass(status: ContractStatus): string {
  if (status === 'Active') return 'org-badge-ativo';
  if (status === 'Renewal') return 'org-badge-renovacao';
  return 'org-badge-inativo';
}

function slaColor(pct: number): string {
  if (pct >= 85) return 'var(--green)';
  if (pct >= 70) return 'var(--yellow)';
  return 'var(--red)';
}

function formatMoney(v?: number | null): string {
  if (!v) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; }

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminOrgaos({ onBack: _onBack, dark, onToggleTheme }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    contractsApi.getAll()
      .then(data => setContracts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => contracts.filter(c => {
    if (search && !c.publicOrganName.toLowerCase().includes(search.toLowerCase()) &&
        !c.contractNumber.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  }), [contracts, search, filterStatus]);

  // KPIs
  const kpiAtivos = contracts.filter(c => c.status === 'Active').length;
  const kpiUPAs = contracts.reduce((s, c) => s + c.clinics.length, 0);
  const kpiRenovacao = contracts.filter(c => c.status === 'Renewal').length;

  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORG_CSS }} />

      <div className="org-topbar">
        <div>
          <div className="org-topbar-title">Órgãos Públicos</div>
          <div className="org-topbar-sub">Contratos e parcerias com prefeituras e secretarias</div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
      </div>

      <div className="org-content">
        <div className="org-page-header">
          <div>
            <div className="org-page-title">Gestão de Contratos</div>
            <div className="org-page-sub">Prefeituras e secretarias atendidas pela OS — somente leitura</div>
          </div>
          <div className="org-readonly-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Gerenciado pela 24p7
          </div>
        </div>

        {/* KPIs */}
        <div className="org-kpi-strip">
          <div className="org-kpi indigo"><div className="org-kpi-lbl">Contratos ativos</div><div className="org-kpi-val">{loading ? '—' : kpiAtivos}</div><div className="org-kpi-sub">prefeituras atendidas</div></div>
          <div className="org-kpi teal"><div className="org-kpi-lbl">UPAs cobertas</div><div className="org-kpi-val">{loading ? '—' : kpiUPAs}</div><div className="org-kpi-sub">unidades monitoradas</div></div>
          <div className="org-kpi green"><div className="org-kpi-lbl">Total de contratos</div><div className="org-kpi-val">{loading ? '—' : contracts.length}</div><div className="org-kpi-sub">nesta OS</div></div>
          <div className="org-kpi yellow"><div className="org-kpi-lbl">Em renovação</div><div className="org-kpi-val">{loading ? '—' : kpiRenovacao}</div><div className="org-kpi-sub">vence em breve</div></div>
        </div>

        {/* Filtros */}
        <div className="org-filter-bar">
          <div className="org-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="org-search-input" type="text" placeholder="Buscar por nome do órgão ou nº contrato..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="org-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="Active">Ativo</option>
            <option value="Renewal">Em renovação</option>
            <option value="Inactive">Inativo</option>
          </select>
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
              return (
                <div key={contract.id} className="org-card">
                  <div className="org-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', flex: 1 }}>
                      <div className="org-card-icon" style={{ background: color.bg }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      </div>
                      <div>
                        <div className="org-card-nome">{contract.publicOrganName}</div>
                        <div className="org-card-sigla">{contract.publicOrganAcronym ? `${contract.publicOrganAcronym} · ` : ''}{contract.contractNumber}</div>
                      </div>
                    </div>
                    <span className={`org-badge ${statusBadgeClass(contract.status)}`}>{contract.statusLabel}</span>
                  </div>

                  <div className="org-card-body">
                    <div className="org-info-grid">
                      <div className="org-info-item"><div className="org-info-lbl">Nº do contrato</div><div className="org-info-val">{contract.contractNumber}</div></div>
                      <div className="org-info-item"><div className="org-info-lbl">Valor mensal</div><div className="org-info-val" style={{ color: 'var(--green)' }}>{formatMoney(contract.monthlyValue)}</div></div>
                      <div className="org-info-item"><div className="org-info-lbl">Vigência</div><div className="org-info-val" style={{ fontSize: '.78rem' }}>{formatDate(contract.startDate)} – {formatDate(contract.endDate)}</div></div>
                      <div className="org-info-item"><div className="org-info-lbl">UPAs cobertas</div><div className="org-info-val">{contract.clinics.length} unidade{contract.clinics.length !== 1 ? 's' : ''}</div></div>
                      {sla && <div className="org-info-item"><div className="org-info-lbl">SLA mínimo</div><div className="org-info-val" style={{ color: 'var(--green)' }}>{sla}%</div></div>}
                    </div>

                    {/* UPAs vinculadas */}
                    {contract.clinics.length > 0 && (
                      <div className="org-upas-wrap">
                        {contract.clinics.map(c => (
                          <span key={c.id} className={`org-upa-chip ${!c.isActive ? 'inactive' : ''}`}>{c.name}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="org-card-footer">
                    <div className={`org-footer-info ${isExpiring ? 'warning' : ''}`}>
                      {isExpiring
                        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Vence em {days} dias</>
                        : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Renova em {formatDate(contract.endDate)}</>
                      }
                    </div>
                    {sla && (
                      <div className="org-sla-mini">
                        <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)' }}>SLA mín.</span>
                        <span style={{ fontSize: '.75rem', fontWeight: 900, color: slaColor(sla) }}>{sla}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const ORG_CSS = `
#adm-root .org-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .org-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .org-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .org-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .org-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .org-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .org-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
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
#adm-root .org-filter-select { appearance:none; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:.65rem 2.2rem .65rem .9rem; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); outline:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .7rem center; }
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
#adm-root .org-sla-mini { display:flex; align-items:center; gap:.35rem; }
#adm-root.dark .org-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .org-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .org-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .org-filter-select { background-color:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .org-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .org-info-item { background:#0f1119; }
#adm-root.dark .org-card-footer { border-top-color:rgba(255,255,255,.06); }
`;
