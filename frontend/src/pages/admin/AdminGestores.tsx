/**
 * Admin OS — Gestores do Órgão.
 * Read-only for AdminClinica; AdminGlobal (24p7) can add/edit.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { contractsApi } from '../../api/contractsApi';
import { gestoresApi, type GestorResponse } from '../../api/gestoresApi';
import { useAuth } from '../../hooks/useAuth';
import type { Contract } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

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
    <div className="gest-cselect" ref={ref}>
      <button className="gest-cselect-btn" type="button" onClick={() => setOpen(!open)}>
        <span style={{ color: selected ? 'inherit' : 'var(--muted)' }}>{selected?.label || 'Selecione o contrato...'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="gest-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`gest-cselect-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


interface GestorView {
  id: string;
  name: string;
  initials: string;
  email: string;
  color: string;
  orgao: string;
  contractNumber: string;
  clinics: string[];
  isActive: boolean;
}

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; onOpenSidebar?: () => void; }

export function AdminGestores({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOrgao, setFilterOrgao] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fCargo, setFCargo] = useState('');
  const [fPublicOrganId, setFPublicOrganId] = useState('');

  // Lista de órgãos públicos únicos (extraídos dos contratos) — usado
  // no select do formulário. Um mesmo órgão pode ter N contratos, mas
  // o gestor é vinculado ao órgão em si, não a um contrato específico.
  const publicOrgans = useMemo(() => {
    const map = new Map<string, { id: string; name: string; acronym: string | null }>();
    contracts.forEach(c => {
      if (c.publicOrganId && !map.has(c.publicOrganId)) {
        map.set(c.publicOrganId, {
          id: c.publicOrganId,
          name: c.publicOrganName,
          acronym: c.publicOrganAcronym ?? null,
        });
      }
    });
    return Array.from(map.values());
  }, [contracts]);

  // Gestores vindos do backend (UserPublicOrganRole). Recarrega após
  // cada mutação (create, toggle, remove) pra manter a UI consistente
  // com o servidor sem otimismo local.
  const [gestoresData, setGestoresData] = useState<GestorResponse[]>([]);

  async function loadAll() {
    setLoading(true);
    try {
      const [contractsRes, gestoresRes] = await Promise.all([
        contractsApi.getAll().catch(() => [] as Contract[]),
        gestoresApi.getAll().catch(() => [] as GestorResponse[]),
      ]);
      setContracts(Array.isArray(contractsRes) ? contractsRes : []);
      setGestoresData(Array.isArray(gestoresRes) ? gestoresRes : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Deriva GestorView (formato interno da UI) a partir do GestorResponse
  // do backend + Contract já buscado. Mantém compat com a estrutura de
  // tabela existente (avatar colorido, contractNumber, chips de UPAs
  // derivadas do contract vinculado ao mesmo publicOrganId).
  const gestores: GestorView[] = useMemo(() => gestoresData.map(g => {
    const contract = contracts.find(c => c.publicOrganId === g.publicOrganId);
    const initials = g.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() ?? '')
      .join('');
    // Cor determinística por hash simples do id — mantém o avatar
    // estável entre renders sem persistir no backend.
    const palette = ['#6366f1', '#2DBFB8', '#8b5cf6', '#f97316', '#22c55e', '#f59e0b', '#6b7280', '#ef4444'];
    const hash = Array.from(g.id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const color = palette[hash % palette.length];
    return {
      id: g.id,
      name: g.name,
      initials: initials || '—',
      email: g.email,
      color,
      orgao: g.publicOrganName || '—',
      contractNumber: contract?.contractNumber ?? '—',
      clinics: (contract?.clinics ?? []).map(c => c.name),
      isActive: g.isActive,
    };
  }), [gestoresData, contracts]);

  const uniqueOrgaos = useMemo(() => [...new Set(gestores.map(g => g.orgao).filter(o => o !== '—'))], [gestores]);

  const filtered = useMemo(() => gestores.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) &&
        !g.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterOrgao && g.orgao !== filterOrgao) return false;
    if (filterStatus === 'ativo' && !g.isActive) return false;
    if (filterStatus === 'inativo' && g.isActive) return false;
    return true;
  }), [gestores, search, filterOrgao, filterStatus]);

  const kpiTotal = gestores.length;
  const kpiAtivos = gestores.filter(g => g.isActive).length;
  const kpiOrgaos = uniqueOrgaos.length;
  const kpiInativos = kpiTotal - kpiAtivos;

  function showToast(msg: string, err = false) {
    setToast(msg); setToastError(err);
    setTimeout(() => setToast(''), 3500);
  }

  function openDrawer() {
    setFName(''); setFEmail(''); setFPhone(''); setFCargo('');
    setFPublicOrganId(publicOrgans[0]?.id ?? '');
    setDrawerOpen(false);
    setDrawerOpen(true);
  }

  async function salvarGestor() {
    if (!fName.trim() || !fEmail.trim()) {
      showToast('Nome e e-mail são obrigatórios.', true);
      return;
    }
    if (!fPublicOrganId) {
      showToast('Selecione um órgão público.', true);
      return;
    }

    setSaving(true);
    try {
      await gestoresApi.create({
        name: fName.trim(),
        email: fEmail.trim(),
        phone: fPhone.replace(/\D/g, '') || undefined,
        cargo: fCargo.trim() || undefined,
        publicOrganId: fPublicOrganId,
      });
      showToast(`Convite enviado para ${fEmail.trim()}. O gestor receberá senha temporária por e-mail.`);
      setDrawerOpen(false);
      // Refetch: gestor recém-criado precisa aparecer imediatamente na tabela.
      await loadAll();
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('409') || raw.toLowerCase().includes('conflict')) {
        showToast('Já existe um usuário com esse e-mail.', true);
      } else if (raw.includes('403') || raw.toLowerCase().includes('forbidden')) {
        showToast('Somente AdminGlobal pode cadastrar gestores.', true);
      } else {
        showToast('Falha ao cadastrar gestor. Tente novamente.', true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleGestorStatus(gestor: GestorView) {
    if (!isAdminGlobal) return;
    try {
      await gestoresApi.toggleStatus(gestor.id);
      showToast(`Status de ${gestor.name} atualizado.`);
      await loadAll();
    } catch {
      showToast('Falha ao atualizar status.', true);
    }
  }

  async function revogarGestor(gestor: GestorView) {
    if (!isAdminGlobal) return;
    if (!window.confirm(`Revogar acesso de ${gestor.name}? O vínculo com o órgão será removido; o cadastro do usuário é preservado por LGPD.`)) {
      return;
    }
    try {
      await gestoresApi.remove(gestor.id);
      showToast(`Acesso de ${gestor.name} revogado.`);
      await loadAll();
    } catch {
      showToast('Falha ao revogar acesso.', true);
    }
  }

  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GESTORES_CSS }} />

      <div className="gest-topbar">
        <div className="gest-topbar-left">
          <button className="gest-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="gest-topbar-title">Gestores do Órgão Público</div>
            <div className="gest-topbar-sub">Usuários das prefeituras com acesso ao painel do Órgão Público</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
      </div>

      <div className="gest-content">
        <div className="gest-page-header">
          <div>
            <div className="gest-page-title">Gestores Cadastrados</div>
            <div className="gest-page-sub">A OS controla quem da prefeitura pode acessar o sistema e o que pode visualizar</div>
          </div>
          {isAdminGlobal ? (
            <button className="gest-btn-novo" onClick={openDrawer}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Novo gestor
            </button>
          ) : (
            <div className="gest-readonly-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Cadastro exclusivo 24p7
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="gest-kpi-strip">
          <div className="gest-kpi indigo"><div className="gest-kpi-lbl">Total de gestores</div><div className="gest-kpi-val">{loading ? '—' : kpiTotal}</div><div className="gest-kpi-sub">em {kpiOrgaos} órgão{kpiOrgaos !== 1 ? 's' : ''}</div></div>
          <div className="gest-kpi green"><div className="gest-kpi-lbl">Ativos</div><div className="gest-kpi-val">{loading ? '—' : kpiAtivos}</div><div className="gest-kpi-sub">com acesso liberado</div></div>
          <div className="gest-kpi yellow"><div className="gest-kpi-lbl">Inativos</div><div className="gest-kpi-val">{loading ? '—' : kpiInativos}</div><div className="gest-kpi-sub">acesso suspenso</div></div>
          <div className="gest-kpi teal"><div className="gest-kpi-lbl">Órgãos vinculados</div><div className="gest-kpi-val">{loading ? '—' : kpiOrgaos}</div><div className="gest-kpi-sub">prefeituras ativas</div></div>
        </div>

        {/* Filtros */}
        <div className="gest-filter-bar">
          <div className="gest-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="gest-search-input" type="text" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect
            value={filterOrgao}
            onChange={setFilterOrgao}
            options={[
              { value: '', label: 'Todos os órgãos' },
              ...uniqueOrgaos.map(o => ({ value: o, label: o })),
            ]}
          />
          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'ativo', label: 'Ativo' },
              { value: 'inativo', label: 'Inativo' },
            ]}
          />
        </div>

        {/* Tabela */}
        <div className="gest-table-card">
          <div className="gest-table-header-bar">
            <div className="gest-table-title">Gestores por órgão público</div>
            <div className="gest-table-count">{filtered.length} gestor{filtered.length !== 1 ? 'es' : ''}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="gest-table">
              <thead>
                <tr>
                  <th>Gestor</th>
                  <th>Órgão público</th>
                  <th>Cargo</th>
                  <th className="center">Nível de acesso</th>
                  <th className="center">Status</th>
                  <th className="center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>
                    Nenhum gestor cadastrado. {isAdminGlobal ? 'Clique em "Novo gestor" para começar.' : 'A OS ainda não cadastrou gestores para os contratos.'}
                  </td></tr>
                ) : filtered.map(g => (
                  <tr key={g.id}>
                    <td>
                      <div className="gest-td-user">
                        <div className="gest-td-avatar" style={{ background: g.color }}>{g.initials}</div>
                        <div><div className="gest-td-name">{g.name}</div><div className="gest-td-sub">{g.email}</div></div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{g.orgao}</div>
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{g.contractNumber}</div>
                    </td>
                    <td style={{ color: 'var(--muted)', fontWeight: 700 }}>
                      {g.clinics.length > 0
                        ? <div className="gest-clinics-wrap">{g.clinics.map(c => <span key={c} className="gest-clinic-chip">{c}</span>)}</div>
                        : '—'
                      }
                    </td>
                    <td className="center">
                      <span className="gest-access-badge gest-access-full">Acesso completo</span>
                    </td>
                    <td className="center">
                      <span className={`gest-badge ${g.isActive ? 'gest-badge-ativo' : 'gest-badge-inativo'}`}>
                        {g.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="center">
                      <div className="gest-actions-cell">
                        {/* Visualizar — todos os perfis */}
                        <button className="gest-act-btn" title="Ver detalhes" onClick={() => showToast(`Detalhes de ${g.name} — em breve`)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        {/* Toggle status + revogar — só AdminGlobal (cadastro exclusivo 24p7).
                            Editar granular fica pra sprint futura — hoje só liga/desliga acesso. */}
                        {isAdminGlobal && (
                          <>
                            <button
                              className="gest-act-btn"
                              title={g.isActive ? 'Desativar gestor' : 'Ativar gestor'}
                              onClick={() => toggleGestorStatus(g)}
                            >
                              {g.isActive ? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/></svg>
                              ) : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="3"/></svg>
                              )}
                            </button>
                            <button
                              className="gest-act-btn gest-act-danger"
                              title="Revogar acesso"
                              onClick={() => revogarGestor(g)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="gest-pagination">
            <div className="gest-pag-info">Exibindo 1–{filtered.length} de {filtered.length} gestores</div>
          </div>
        </div>
      </div>

      <div className={`gest-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>

      {/* Drawer — Novo Gestor (AdminGlobal only) */}
      {drawerOpen && <div className="gest-overlay" onClick={() => setDrawerOpen(false)} />}
      <div className={`gest-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="gest-drawer-header">
          <div className="gest-drawer-title">Novo gestor do órgão público</div>
          <button className="gest-drawer-close" onClick={() => setDrawerOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="gest-drawer-body">
          {/* Dados do gestor */}
          <div className="gest-form-section">
            <div className="gest-form-section-title">Dados do gestor</div>
            <div className="gest-form-row">
              <div className="gest-field"><label>Nome completo *</label><input type="text" placeholder="Ex: Valmir Correia Sousa" value={fName} onChange={e => setFName(e.target.value)} /></div>
              <div className="gest-field"><label>Cargo</label><input type="text" placeholder="Ex: Secretário de Saúde" value={fCargo} onChange={e => setFCargo(e.target.value)} /></div>
            </div>
            <div className="gest-form-row">
              <div className="gest-field"><label>E-mail institucional *</label><input type="email" placeholder="gestor@prefeitura.gov.br" value={fEmail} onChange={e => setFEmail(e.target.value)} /></div>
              <div className="gest-field"><label>Telefone</label><input type="text" placeholder="(11) 99999-9999" value={fPhone} onChange={e => setFPhone(maskPhone(e.target.value))} /></div>
            </div>
          </div>

          {/* Órgão público vinculado */}
          <div className="gest-form-section">
            <div className="gest-form-section-title">Órgão público</div>
            <div className="gest-form-row full">
              <div className="gest-field">
                <label>Selecione o órgão público *</label>
                <CustomSelect
                  value={fPublicOrganId}
                  onChange={v => setFPublicOrganId(v)}
                  options={[
                    { value: '', label: 'Selecione o órgão...' },
                    ...publicOrgans.map(o => ({
                      value: o.id,
                      label: o.acronym ? `${o.name} (${o.acronym})` : o.name,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="gest-form-row full">
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: '1.4' }}>
                O gestor terá acesso ao painel completo do órgão selecionado, incluindo todas as UPAs e contratos vinculados.
              </div>
            </div>
          </div>
        </div>
        <div className="gest-drawer-footer">
          <button className="gest-btn-cancelar" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancelar</button>
          <button
            className="gest-btn-salvar"
            disabled={saving || !fName.trim() || !fEmail.trim() || !fPublicOrganId}
            onClick={salvarGestor}
          >
            {saving ? 'Enviando…' : 'Salvar e enviar convite'}
          </button>
        </div>
      </div>
    </>
  );
}

const GESTORES_CSS = `
#adm-root .gest-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .gest-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .gest-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .gest-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .gest-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .gest-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .gest-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .gest-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .gest-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .gest-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .gest-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s; }
#adm-root .gest-btn-novo:hover { transform:translateY(-1px); }
#adm-root .gest-readonly-badge { display:flex; align-items:center; gap:.4rem; background:var(--indigo-light); border:1.5px solid rgba(99,102,241,.2); border-radius:10px; padding:.5rem .9rem; font-size:.72rem; font-weight:800; color:var(--indigo); }
#adm-root .gest-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .gest-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .gest-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .gest-kpi.indigo::after{background:var(--indigo);} #adm-root .gest-kpi.green::after{background:var(--green);} #adm-root .gest-kpi.teal::after{background:var(--teal);} #adm-root .gest-kpi.yellow::after{background:var(--yellow);}
#adm-root .gest-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .gest-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .gest-kpi.indigo .gest-kpi-val{color:var(--indigo);} #adm-root .gest-kpi.green .gest-kpi-val{color:var(--green);} #adm-root .gest-kpi.teal .gest-kpi-val{color:var(--teal);} #adm-root .gest-kpi.yellow .gest-kpi-val{color:var(--yellow);}
#adm-root .gest-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .gest-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .gest-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .gest-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .gest-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .gest-search-input:focus { border-color:var(--indigo); }
#adm-root .gest-filter-select { appearance:none; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:.65rem 2.2rem .65rem .9rem; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); outline:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .7rem center; }
#adm-root .gest-table-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .gest-table-header-bar { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .gest-table-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .gest-table-count { font-size:.72rem; font-weight:700; color:var(--muted); }
#adm-root .gest-table { width:100%; border-collapse:collapse; }
#adm-root .gest-table thead tr { background:var(--bg); border-bottom:1px solid var(--border); }
#adm-root .gest-table thead th { padding:.75rem 1.1rem; font-size:.63rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); text-align:left; white-space:nowrap; }
#adm-root .gest-table thead th.center { text-align:center; }
#adm-root .gest-table tbody tr { border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .gest-table tbody tr:last-child { border-bottom:none; }
#adm-root .gest-table tbody tr:hover { background:#f9f9fc; }
#adm-root .gest-table tbody td { padding:.85rem 1.1rem; font-size:.82rem; font-weight:600; color:var(--text); vertical-align:middle; }
#adm-root .gest-table tbody td.center { text-align:center; }
#adm-root .gest-td-user { display:flex; align-items:center; gap:.75rem; }
#adm-root .gest-td-avatar { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .gest-td-name { font-weight:800; color:var(--text); line-height:1.2; }
#adm-root .gest-td-sub { font-size:.7rem; font-weight:600; color:var(--muted); }
#adm-root .gest-badge { display:inline-flex; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .gest-badge-ativo { background:var(--green-light); color:#16a34a; }
#adm-root .gest-badge-inativo { background:var(--red-light); color:#dc2626; }
#adm-root .gest-access-badge { display:inline-flex; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .gest-access-full { background:var(--indigo-light); color:var(--indigo); }
#adm-root .gest-access-read { background:var(--purple-light); color:var(--purple); }
#adm-root .gest-access-dash { background:var(--teal-light); color:#0f766e; }
#adm-root .gest-access-ro { background:var(--bg); color:var(--muted); border:1px solid var(--border); }
#adm-root .gest-clinics-wrap { display:flex; gap:.3rem; flex-wrap:wrap; }
#adm-root .gest-clinic-chip { font-size:.62rem; font-weight:700; padding:.15rem .5rem; border-radius:6px; background:var(--bg); color:var(--muted); }
#adm-root .gest-actions-cell { display:flex; align-items:center; justify-content:center; gap:.4rem; }
#adm-root .gest-act-btn { width:30px; height:30px; border-radius:8px; border:1.5px solid var(--border); background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted); transition:all .15s; }
#adm-root .gest-act-btn:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .gest-act-danger:hover { border-color:var(--red); color:var(--red); background:var(--red-light); }
#adm-root .gest-pagination { padding:.9rem 1.4rem; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .gest-pag-info { font-size:.72rem; font-weight:600; color:var(--muted); }
#adm-root .gest-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .gest-toast.show { transform:translateY(0); opacity:1; }
#adm-root .gest-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }
#adm-root .gest-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; }
#adm-root .gest-drawer { position:fixed; top:0; right:0; bottom:0; width:540px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .gest-drawer.open { transform:translateX(0); }
#adm-root .gest-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .gest-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .gest-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .gest-drawer-close:hover { color:var(--text); }
#adm-root .gest-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .gest-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; flex-shrink:0; }
#adm-root .gest-form-section { margin-bottom:1.4rem; }
#adm-root .gest-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--indigo); margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid var(--indigo-light); }
#adm-root .gest-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; margin-bottom:.9rem; }
#adm-root .gest-form-row.full { grid-template-columns:1fr; }
#adm-root .gest-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .gest-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .gest-field input, #adm-root .gest-field select { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .gest-field input:focus, #adm-root .gest-field select:focus { border-color:var(--indigo); background:#fff; }
#adm-root .gest-field select { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .8rem center; background-color:var(--bg); cursor:pointer; }
#adm-root .gest-access-grid { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; }
#adm-root .gest-access-opt { border:1.5px solid var(--border); border-radius:12px; padding:.8rem; cursor:pointer; transition:all .15s; }
#adm-root .gest-access-opt:hover { border-color:var(--indigo); background:var(--indigo-light); }
#adm-root .gest-access-opt.selected { border-color:var(--indigo); background:var(--indigo-light); }
#adm-root .gest-access-opt-name { font-size:.8rem; font-weight:800; color:var(--text); margin-bottom:.25rem; }
#adm-root .gest-access-opt.selected .gest-access-opt-name { color:var(--indigo); }
#adm-root .gest-access-opt-desc { font-size:.65rem; font-weight:600; color:var(--muted); line-height:1.4; }
#adm-root .gest-clinics-check { display:flex; flex-direction:column; gap:.4rem; }
#adm-root .gest-clinic-check-item { display:flex; align-items:center; gap:.7rem; padding:.6rem .8rem; background:var(--bg); border-radius:10px; cursor:pointer; transition:background .15s; }
#adm-root .gest-clinic-check-item:hover { background:var(--indigo-light); }
#adm-root .gest-clinic-check-item input { accent-color:var(--indigo); width:16px; height:16px; cursor:pointer; }
#adm-root .gest-clinic-check-label { font-size:.82rem; font-weight:700; color:var(--text); }
#adm-root .gest-clinic-check-sub { font-size:.65rem; font-weight:600; color:var(--muted); margin-left:auto; }
#adm-root .gest-btn-salvar { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); box-shadow:0 3px 12px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .gest-btn-salvar:hover { transform:translateY(-1px); }
#adm-root .gest-btn-salvar:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
#adm-root .gest-btn-cancelar { padding:.85rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; }
#adm-root .gest-btn-cancelar:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root.dark .gest-drawer { background:#1a1f36; }
#adm-root.dark .gest-drawer-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .gest-drawer-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .gest-field input, #adm-root.dark .gest-field select { background-color:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .gest-field input:focus, #adm-root.dark .gest-field select:focus { border-color:var(--indigo); }
#adm-root.dark .gest-field input::placeholder { color:#64748b; }
#adm-root.dark .gest-clinic-check-item { background:#0f1119; }
#adm-root.dark .gest-clinic-check-item:hover { background:rgba(99,102,241,.15); }
#adm-root.dark .gest-access-opt { border-color:rgba(255,255,255,.1); }
#adm-root.dark .gest-access-opt:hover, #adm-root.dark .gest-access-opt.selected { background:rgba(99,102,241,.15); border-color:var(--indigo); }
#adm-root.dark .gest-form-section-title { border-bottom-color:rgba(99,102,241,.2); }
#adm-root .gest-cselect { position:relative; }
#adm-root .gest-cselect-btn { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; background:var(--bg); font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); cursor:pointer; transition:border-color .2s; width:100%; }
#adm-root .gest-filter-bar .gest-cselect-btn { background:var(--surface); border-radius:12px; }
#adm-root .gest-cselect-btn:hover { border-color:var(--indigo); }
#adm-root .gest-cselect-btn svg { color:var(--indigo); flex-shrink:0; }
#adm-root .gest-cselect-dropdown { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:60; overflow:hidden; animation:fadeUp .15s ease; }
#adm-root .gest-cselect-option { padding:.65rem 1rem; font-size:.82rem; font-weight:600; color:var(--text); cursor:pointer; transition:background .12s; }
#adm-root .gest-cselect-option:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .gest-cselect-option.active { background:var(--indigo); color:#fff; font-weight:800; }
#adm-root.dark .gest-cselect-btn { background:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .gest-filter-bar .gest-cselect-btn { background:#1a1f36; }
#adm-root.dark .gest-cselect-dropdown { background:#1a1f36; border-color:rgba(255,255,255,.1); box-shadow:0 8px 24px rgba(0,0,0,.4); }
#adm-root.dark .gest-cselect-option { color:#e2e8f0; }
#adm-root.dark .gest-cselect-option:hover { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .gest-cselect-option.active { background:var(--indigo); color:#fff; }
#adm-root.dark .gest-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .gest-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .gest-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .gest-filter-select { background-color:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .gest-table-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .gest-table thead tr { background:#0f1119; }
#adm-root.dark .gest-table tbody tr:hover { background:rgba(255,255,255,.03); }
#adm-root.dark .gest-table tbody tr { border-bottom-color:rgba(255,255,255,.04); }
#adm-root.dark .gest-table-header-bar { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .gest-clinic-chip { background:#0f1119; color:#94a3b8; }
#adm-root.dark .gest-pagination { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .gest-access-ro { background:#0f1119; border-color:rgba(255,255,255,.1); }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .gest-hamburger { display:flex; }
  #adm-root .gest-topbar { padding:.85rem 1rem; }
  #adm-root .gest-content { padding:1rem; overflow-y:auto; }
  #adm-root .gest-page-header { flex-direction:column; align-items:flex-start; gap:.75rem; }

  /* KPIs 2x2 */
  #adm-root .gest-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .gest-kpi { padding:.9rem 1rem; }
  #adm-root .gest-kpi-lbl { font-size:.6rem; white-space:normal; word-break:break-word; }
  #adm-root .gest-kpi-val { font-size:1.6rem; }
  #adm-root .gest-kpi-sub { font-size:.62rem; }

  /* Filtros empilhados */
  #adm-root .gest-filter-bar { flex-direction:column; align-items:stretch; gap:.6rem; }
  #adm-root .gest-search-wrap { min-width:unset; }
  #adm-root .gest-cselect { min-width:unset; width:100%; }

  /* Tabela: esconde colunas menos importantes */
  #adm-root .gest-table thead th:nth-child(3),
  #adm-root .gest-table thead th:nth-child(4),
  #adm-root .gest-table tbody td:nth-child(3),
  #adm-root .gest-table tbody td:nth-child(4) { display:none; }

  /* Drawer */
  #adm-root .gest-drawer { width:100vw; }
}

@media (max-width: 480px) {
  #adm-root .gest-kpi-strip { gap:.5rem; }
  #adm-root .gest-kpi { padding:.75rem .85rem; }
  #adm-root .gest-kpi-val { font-size:1.4rem; }
}
`;
