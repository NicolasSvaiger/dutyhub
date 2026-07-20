/**
 * Admin OS — Usuários da OS.
 * Manages OS collaborators (AdminGlobal, AdminClinica).
 * Read-only view of users with admin roles + status toggle.
 * Replicates the mock at /originais/OS/admin-usuarios.html.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../hooks/useAuth';
import type { User } from '../../types';
import { formatDayMonthBR, formatHmCompactBR, isTodayBR, isYesterdayBR } from '../../utils/dateTimeBR';

// ─── Types ────────────────────────────────────────────────────────────────

type PerfilBadge = 'Admin Master' | 'Admin OS';
type StatusBadge = 'Ativo' | 'Pendente' | 'Inativo';

interface UsuarioOSView {
  id: string;
  nome: string;
  iniciais: string;
  cargo: string;
  email: string;
  dept: string;
  perfil: PerfilBadge;
  status: StatusBadge;
  ultimo: string;
  cor: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const CORES = ['#6366f1', '#2DBFB8', '#8b5cf6', '#f97316', '#22c55e', '#f59e0b', '#6b7280', '#ef4444'];

function roleToPerfil(roles: { role: string }[]): PerfilBadge {
  const roleNames = roles.map(r => r.role);
  if (roleNames.includes('AdminGlobal')) return 'Admin Master';
  if (roleNames.includes('AdminClinica')) return 'Admin OS';
  return 'Admin OS';
}

function formatLastAccess(iso?: string | null): string {
  if (!iso) return 'Nunca acessou';
  const time = formatHmCompactBR(iso);
  if (isTodayBR(iso)) return `Hoje, ${time}`;
  if (isYesterdayBR(iso)) return `Ontem, ${time}`;
  return formatDayMonthBR(iso) + `, ${time}`;
}

// ─── CustomSelect ─────────────────────────────────────────────────────────

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
    <div className="uos-cselect" ref={ref}>
      <button className="uos-cselect-btn" type="button" onClick={() => setOpen(!open)}>
        <span>{selected?.label || '—'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="uos-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`uos-cselect-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

export function AdminUsuariosOS({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPerfil, setFilterPerfil] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form state
  const [fNome, setFNome] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fCargo, setFCargo] = useState('');
  const [fDept, setFDept] = useState('');
  const [fPerfil, setFPerfil] = useState('');
  const [fObs, setFObs] = useState('');
  const [saving, setSaving] = useState(false);

  // Edição — reusa o mesmo drawer da criação. editingId != null indica
  // modo edição: título, submit e payload mudam, mas o layout do form
  // permanece o mesmo (evita duplicar todo o JSX do drawer).
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    usersApi.getAdmins()
      .then(u => setUsers(Array.isArray(u) ? u : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const usuarios: UsuarioOSView[] = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.map((u, i) => {
      const roles = u.roles || [];
      const perfil = roleToPerfil(roles);
      const iniciais = (u.name || u.email || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
      return {
        id: u.id,
        nome: u.name || u.email || 'Usuário',
        iniciais,
        cargo: perfil === 'Admin Master' ? 'Administrador 24p7' : 'Admin OS',
        email: u.email || '',
        dept: perfil === 'Admin Master' ? '24p7' : 'Organização de Saúde',
        perfil,
        status: u.isActive === false ? 'Inativo' : 'Ativo' as StatusBadge,
        ultimo: formatLastAccess(u.createdAt),
        cor: CORES[i % CORES.length],
      };
    });
  }, [users]);

  const filtered = useMemo(() => {
    return usuarios.filter(u => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.nome.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      }
      if (filterPerfil && u.perfil !== filterPerfil) return false;
      if (filterStatus && u.status !== filterStatus) return false;
      return true;
    });
  }, [usuarios, search, filterPerfil, filterStatus]);

  const kpiTotal = usuarios.length;
  const kpiAtivos = usuarios.filter(u => u.status === 'Ativo').length;
  const kpiPendentes = usuarios.filter(u => u.status === 'Pendente').length;
  const kpiInativos = usuarios.filter(u => u.status === 'Inativo').length;

  function showToast(msg: string, error = false) {
    setToast(msg);
    setToastError(error);
    setTimeout(() => setToast(''), 3000);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFNome(''); setFEmail(''); setFCargo(''); setFDept(''); setFPerfil(''); setFObs('');
  }

  function openCreateDrawer() {
    setEditingId(null);
    setFNome(''); setFEmail(''); setFCargo(''); setFDept(''); setFPerfil(''); setFObs('');
    setDrawerOpen(true);
  }

  function openEditDrawer(u: UsuarioOSView) {
    setEditingId(u.id);
    setFNome(u.nome);
    setFEmail(u.email);
    setFCargo('');
    setFDept('');
    // No modo edição não trocamos o perfil de acesso — isso é uma
    // operação de role separada (clinic-role), não parte do update básico.
    setFPerfil(u.perfil);
    setFObs('');
    setDrawerOpen(true);
  }

  // No modo edição não exigimos perfil (já é fixo) — só nome e email.
  const formValid = editingId
    ? fNome.trim() !== '' && fEmail.trim() !== ''
    : fNome.trim() !== '' && fEmail.trim() !== '' && fPerfil !== '';

  async function salvar() {
    if (!formValid) return;
    setSaving(true);
    try {
      if (editingId) {
        // Edição: nome + email. Backend sincroniza email com Cognito e
        // valida duplicidade (409 se outro usuário já usa o endereço).
        const updated = await usersApi.update(editingId, {
          name: fNome.trim(),
          email: fEmail.trim(),
        });
        setUsers(prev => prev.map(x => x.id === editingId ? { ...x, ...updated } : x));
        showToast(`${fNome} atualizado(a) com sucesso!`);
      } else {
        // Criação: o backend cria no Cognito com senha temporária e envia
        // o email de convite nativamente — não enviamos senha nenhuma.
        const newUser = await usersApi.create({
          name: fNome.trim(),
          email: fEmail.trim(),
        });

        // Atribuir a role — pega a primeira clinicId do usuário logado
        const clinicId = authUser?.clinicIds?.[0] ?? authUser?.clinicId ?? '';
        if (clinicId) {
          await usersApi.assignRole(newUser.id, {
            clinicId,
            role: fPerfil === 'Admin Master' ? 'AdminGlobal' : 'AdminClinica',
          });
        }

        // Adiciona à lista local
        setUsers(prev => [...prev, {
          ...newUser,
          roles: [{ id: '', userId: newUser.id, clinicId, role: fPerfil === 'Admin Master' ? 'AdminGlobal' : 'AdminClinica', assignedAt: new Date().toISOString() }],
        }]);

        showToast(`${fNome} criado(a) com sucesso! Um convite foi enviado por e-mail.`);
      }
      closeDrawer();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(msg || (editingId ? 'Erro ao atualizar usuário' : 'Erro ao criar usuário'), true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(u: UsuarioOSView) {
    const willActivate = u.status === 'Inativo';
    try {
      const updated = await usersApi.toggleStatus(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: updated.isActive } : x));
      showToast(willActivate ? `${u.nome} reativado(a)` : `${u.nome} suspenso(a)`);
    } catch (err: unknown) {
      // Backend bloqueia desativar o único Admin Master ativo com 409 —
      // mostra a mensagem específica em vez do genérico "Erro ao alterar status".
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(msg || 'Erro ao alterar status', true);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: USUARIOS_CSS }} />

      <div className="uos-topbar">
        <div className="uos-topbar-left">
          <button className="uos-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="uos-topbar-title">Usuários da OS</div>
            <div className="uos-topbar-sub">Gerencie os colaboradores com acesso ao painel administrativo</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
      </div>

      <div className="uos-content">
        <div className="uos-page-header">
          <div>
            <div className="uos-page-title">Gestão de Usuários</div>
            <div className="uos-page-sub">Controle de acesso e perfis dos colaboradores da OS</div>
          </div>
          <button className="uos-btn-novo" onClick={openCreateDrawer}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo usuário
          </button>
        </div>

        {/* KPIs */}
        <div className="uos-kpi-strip">
          <div className="uos-kpi indigo">
            <div className="uos-kpi-lbl">Total de usuários</div>
            <div className="uos-kpi-val">{loading ? '…' : kpiTotal}</div>
            <div className="uos-kpi-sub">cadastrados na OS</div>
          </div>
          <div className="uos-kpi green">
            <div className="uos-kpi-lbl">Ativos</div>
            <div className="uos-kpi-val">{loading ? '…' : kpiAtivos}</div>
            <div className="uos-kpi-sub">com acesso liberado</div>
          </div>
          <div className="uos-kpi yellow">
            <div className="uos-kpi-lbl">Convite pendente</div>
            <div className="uos-kpi-val">{loading ? '…' : kpiPendentes}</div>
            <div className="uos-kpi-sub">aguardando confirmação</div>
          </div>
          <div className="uos-kpi red">
            <div className="uos-kpi-lbl">Inativos</div>
            <div className="uos-kpi-val">{loading ? '…' : kpiInativos}</div>
            <div className="uos-kpi-sub">acesso suspenso</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="uos-filter-bar">
          <div className="uos-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input className="uos-search-input" type="text" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect
            value={filterPerfil}
            onChange={setFilterPerfil}
            options={[
              { value: '', label: 'Todos os perfis' },
              { value: 'Admin Master', label: 'Admin Master' },
              { value: 'Admin OS', label: 'Admin OS' },
            ]}
          />
          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'Ativo', label: 'Ativo' },
              { value: 'Pendente', label: 'Pendente' },
              { value: 'Inativo', label: 'Inativo' },
            ]}
          />
        </div>

        {/* Tabela */}
        <div className="uos-table-card">
          <div className="uos-table-header">
            <div className="uos-table-title">Colaboradores cadastrados</div>
            <div className="uos-table-count">{filtered.length} {filtered.length === 1 ? 'usuário' : 'usuários'}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="uos-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Perfil</th>
                  <th className="center">Status</th>
                  <th>Departamento</th>
                  <th>Último acesso</th>
                  <th className="center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="uos-empty-cell">Carregando…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="uos-empty-cell">Nenhum usuário encontrado.</td></tr>
                )}
                {!loading && filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="uos-td-user">
                        <div className="uos-td-avatar" style={{ background: u.cor }}>{u.iniciais}</div>
                        <div>
                          <div className="uos-td-name">{u.nome}</div>
                          <div className="uos-td-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`uos-badge ${u.perfil === 'Admin Master' ? 'uos-badge-admin' : 'uos-badge-op'}`}>{u.perfil}</span></td>
                    <td className="center"><span className={`uos-badge ${u.status === 'Ativo' ? 'uos-badge-ativo' : u.status === 'Pendente' ? 'uos-badge-pendente' : 'uos-badge-inativo'}`}>{u.status}</span></td>
                    <td className="uos-td-dept">{u.dept}</td>
                    <td><span className="uos-last-access">{u.ultimo}</span></td>
                    <td className="center">
                      <div className="uos-actions-cell">
                        <button className="uos-act-btn" title="Editar" onClick={() => openEditDrawer(u)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button className={`uos-act-btn ${u.status === 'Ativo' ? 'danger' : 'success'}`}
                          title={u.status === 'Ativo' ? 'Suspender' : 'Reativar'}
                          onClick={() => toggleStatus(u)}>
                          {u.status === 'Ativo' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`uos-toast ${toastError ? 'error' : ''}`}>
          <span>{toast}</span>
        </div>
      )}

      {/* Overlay */}
      {drawerOpen && <div className="uos-overlay" onClick={closeDrawer} />}

      {/* Drawer Novo Usuário / Editar Usuário */}
      <div className={`uos-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="uos-drawer-header">
          <div className="uos-drawer-title">{editingId ? 'Editar usuário' : 'Novo usuário'}</div>
          <button className="uos-drawer-close" onClick={closeDrawer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="uos-drawer-body">
          <div className="uos-form-section">
            <div className="uos-form-section-title">Dados pessoais</div>
            <div className="uos-form-row">
              <div className="uos-field"><label>Nome completo *</label><input type="text" placeholder="Ex: João da Silva" value={fNome} onChange={e => setFNome(e.target.value)} /></div>
              <div className="uos-field"><label>Cargo</label><input type="text" placeholder="Ex: Coordenador" value={fCargo} onChange={e => setFCargo(e.target.value)} /></div>
            </div>
            <div className="uos-form-row">
              <div className="uos-field"><label>E-mail corporativo *</label><input type="email" placeholder="joao@organizacao.com.br" value={fEmail} onChange={e => setFEmail(e.target.value)} /></div>
            </div>
            <div className="uos-form-row">
              <div className="uos-field">
                <label>Departamento</label>
                <CustomSelect
                  value={fDept}
                  onChange={setFDept}
                  options={[
                    { value: '', label: 'Selecione...' },
                    { value: 'Coordenação de Escalas', label: 'Coordenação de Escalas' },
                    { value: 'Recursos Humanos', label: 'Recursos Humanos' },
                    { value: 'Diretoria', label: 'Diretoria' },
                    { value: 'Financeiro', label: 'Financeiro' },
                    { value: 'Operações', label: 'Operações' },
                    { value: 'TI', label: 'TI' },
                  ]}
                />
              </div>
              {editingId ? (
                // No modo edição o perfil de acesso não é editável por
                // aqui — troca de role é uma operação separada (clinic-role).
                // Mostramos como leitura pra não confundir o usuário.
                <div className="uos-field">
                  <label>Perfil de acesso</label>
                  <input type="text" value={fPerfil} disabled />
                </div>
              ) : (
                <div className="uos-field">
                  <label>Perfil de acesso *</label>
                  <CustomSelect
                    value={fPerfil}
                    onChange={setFPerfil}
                    options={[
                      { value: '', label: 'Selecione...' },
                      ...(isAdminGlobal ? [{ value: 'Admin Master', label: 'Admin Master (24p7)' }] : []),
                      { value: 'Admin OS', label: 'Admin OS' },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="uos-form-section">
            <div className="uos-form-section-title">Observações</div>
            <div className="uos-form-row uos-full">
              <div className="uos-field"><label>Notas internas</label><textarea placeholder="Informações adicionais sobre este usuário..." value={fObs} onChange={e => setFObs(e.target.value)} rows={3} /></div>
            </div>
          </div>
        </div>
        <div className="uos-drawer-footer">
          <button className="uos-btn-cancelar" onClick={closeDrawer}>Cancelar</button>
          <button className="uos-btn-salvar" onClick={salvar} disabled={!formValid || saving}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar e enviar convite'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── CSS scoped to #adm-root ─────────────────────────────────────────────

const USUARIOS_CSS = `
#adm-root .uos-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:40; }
#adm-root .uos-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .uos-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .uos-hamburger:hover { background:#eef2ff; color:#6366f1; }

#adm-root .uos-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .uos-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .uos-content { flex:1; padding:2rem; animation:uos-fadeUp .35s ease; overflow-y:auto; }
@keyframes uos-fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

#adm-root .uos-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .uos-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .uos-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }

#adm-root .uos-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .uos-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .uos-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .uos-kpi.indigo::after { background:#6366f1; }
#adm-root .uos-kpi.green::after { background:#22c55e; }
#adm-root .uos-kpi.yellow::after { background:#f59e0b; }
#adm-root .uos-kpi.red::after { background:#ef4444; }
#adm-root .uos-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .uos-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .uos-kpi.indigo .uos-kpi-val { color:#6366f1; }
#adm-root .uos-kpi.green .uos-kpi-val { color:#22c55e; }
#adm-root .uos-kpi.yellow .uos-kpi-val { color:#f59e0b; }
#adm-root .uos-kpi.red .uos-kpi-val { color:#ef4444; }
#adm-root .uos-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }

#adm-root .uos-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .uos-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .uos-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .uos-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .uos-search-input:focus { border-color:#6366f1; }

#adm-root .uos-cselect { position:relative; min-width:170px; }
#adm-root .uos-cselect-btn { width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:.65rem 1rem; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:.5rem; transition:border-color .2s; }
#adm-root .uos-cselect-btn:hover { border-color:#6366f1; }
#adm-root .uos-cselect-btn svg { color:#6366f1; }
#adm-root .uos-cselect-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.08); padding:.35rem; z-index:200; }
#adm-root .uos-cselect-option { padding:.55rem .85rem; font-size:.82rem; font-weight:700; color:var(--text); cursor:pointer; border-radius:8px; transition:background .12s; }
#adm-root .uos-cselect-option:hover { background:#eef2ff; color:#6366f1; }
#adm-root .uos-cselect-option.active { background:#6366f1; color:#fff; }

#adm-root .uos-table-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .uos-table-header { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .uos-table-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .uos-table-count { font-size:.72rem; font-weight:700; color:var(--muted); }
#adm-root .uos-table { width:100%; border-collapse:collapse; }
#adm-root .uos-table thead tr { background:var(--bg); border-bottom:1px solid var(--border); }
#adm-root .uos-table thead th { padding:.75rem 1.1rem; font-size:.63rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); text-align:left; white-space:nowrap; }
#adm-root .uos-table thead th.center { text-align:center; }
#adm-root .uos-table tbody tr { border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .uos-table tbody tr:last-child { border-bottom:none; }
#adm-root .uos-table tbody tr:hover { background:rgba(99,102,241,.03); }
#adm-root .uos-table tbody td { padding:.85rem 1.1rem; font-size:.82rem; font-weight:600; color:var(--text); vertical-align:middle; }
#adm-root .uos-table tbody td.center { text-align:center; }
#adm-root .uos-empty-cell { text-align:center; padding:2.5rem; color:var(--muted); font-weight:700; }

#adm-root .uos-td-user { display:flex; align-items:center; gap:.75rem; }
#adm-root .uos-td-avatar { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .uos-td-name { font-weight:800; color:var(--text); line-height:1.2; }
#adm-root .uos-td-email { font-size:.7rem; font-weight:600; color:var(--muted); }
#adm-root .uos-td-dept { font-weight:700; }
#adm-root .uos-last-access { font-size:.75rem; font-weight:700; color:var(--muted); }

#adm-root .uos-badge { display:inline-block; padding:.28rem .7rem; border-radius:8px; font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
#adm-root .uos-badge-admin { background:#eef2ff; color:#4f46e5; }
#adm-root .uos-badge-op { background:#e8faf9; color:#2DBFB8; }
#adm-root .uos-badge-ativo { background:#dcfce7; color:#22c55e; }
#adm-root .uos-badge-pendente { background:#fef3c7; color:#f59e0b; }
#adm-root .uos-badge-inativo { background:#fee2e2; color:#ef4444; }

#adm-root .uos-actions-cell { display:flex; gap:.4rem; justify-content:center; }
#adm-root .uos-act-btn { width:30px; height:30px; background:#eef2ff; border:none; border-radius:8px; color:#6366f1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all .12s; }
#adm-root .uos-act-btn:hover { background:#6366f1; color:#fff; transform:translateY(-1px); }
#adm-root .uos-act-btn.danger { background:#fee2e2; color:#ef4444; }
#adm-root .uos-act-btn.danger:hover { background:#ef4444; color:#fff; }
#adm-root .uos-act-btn.success { background:#dcfce7; color:#22c55e; }
#adm-root .uos-act-btn.success:hover { background:#22c55e; color:#fff; }

#adm-root .uos-toast { position:fixed; bottom:2rem; right:2rem; background:var(--surface); border:1.5px solid #22c55e; border-radius:12px; padding:.85rem 1.2rem; font-size:.85rem; font-weight:700; color:var(--text); box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:200; animation:uos-slideIn .3s ease; }
#adm-root .uos-toast.error { border-color:#ef4444; color:#ef4444; }
@keyframes uos-slideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

#adm-root .uos-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s,box-shadow .14s; }
#adm-root .uos-btn-novo:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(99,102,241,.45); }

#adm-root .uos-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; animation:uos-fadeIn .2s ease; }
@keyframes uos-fadeIn { from{opacity:0} to{opacity:1} }

#adm-root .uos-drawer { position:fixed; top:0; right:0; bottom:0; width:520px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(110%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .uos-drawer.open { transform:translateX(0); }
#adm-root .uos-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .uos-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .uos-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .uos-drawer-close:hover { color:var(--text); }
#adm-root .uos-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .uos-form-section { margin-bottom:1.4rem; }
#adm-root .uos-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#6366f1; margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid #eef2ff; }
#adm-root .uos-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; margin-bottom:.9rem; }
#adm-root .uos-form-row.uos-full { grid-template-columns:1fr; }
#adm-root .uos-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .uos-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .uos-field input, #adm-root .uos-field textarea { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .uos-field input:disabled { opacity:.6; cursor:not-allowed; }
#adm-root .uos-field input:focus, #adm-root .uos-field textarea:focus { border-color:#6366f1; background:#fff; }
#adm-root .uos-field textarea { resize:vertical; }
#adm-root .uos-select { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .8rem center; background-color:var(--bg); cursor:pointer; outline:none; transition:border-color .2s; width:100%; }
#adm-root .uos-select:focus { border-color:#6366f1; }
#adm-root .uos-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.8rem; justify-content:flex-end; flex-shrink:0; }
#adm-root .uos-btn-cancelar { padding:.65rem 1.3rem; border:1.5px solid var(--border); border-radius:12px; background:transparent; color:var(--muted); font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; transition:all .14s; }
#adm-root .uos-btn-cancelar:hover { border-color:var(--text); color:var(--text); }
#adm-root .uos-btn-salvar { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s,box-shadow .14s; }
#adm-root .uos-btn-salvar:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 20px rgba(99,102,241,.45); }
#adm-root .uos-btn-salvar:disabled { opacity:.5; cursor:not-allowed; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .uos-hamburger { display:flex; }
  #adm-root .uos-topbar { padding:.85rem 1rem; }
  #adm-root .uos-content { padding:1rem; }

  /* KPIs: 2x2 */
  #adm-root .uos-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .uos-kpi { padding:.9rem 1rem; }
  #adm-root .uos-kpi-lbl { font-size:.6rem; white-space:normal; word-break:break-word; }
  #adm-root .uos-kpi-val { font-size:1.6rem; }
  #adm-root .uos-kpi-sub { font-size:.62rem; }

  /* Filtros: empilhados */
  #adm-root .uos-filter-bar { flex-direction:column; gap:.6rem; }
  #adm-root .uos-search-wrap { min-width:unset; flex:unset; width:100%; }
  #adm-root .uos-search-input { width:100%; }
  #adm-root .uos-cselect { min-width:unset; width:100%; }

  /* Tabela: esconde colunas menos importantes */
  #adm-root .uos-table thead th:nth-child(4),
  #adm-root .uos-table thead th:nth-child(5),
  #adm-root .uos-table tbody td:nth-child(4),
  #adm-root .uos-table tbody td:nth-child(5) { display:none; }

  /* Drawer: largura total */
  #adm-root .uos-drawer { width:100vw; }
  #adm-root .uos-form-row { grid-template-columns:1fr; }

  #adm-root .uos-page-header { flex-direction:column; align-items:flex-start; gap:.75rem; }
}

@media (max-width: 480px) {
  #adm-root .uos-kpi-strip { gap:.5rem; }
  #adm-root .uos-kpi { padding:.75rem .85rem; }
  #adm-root .uos-kpi-val { font-size:1.4rem; }

  /* Na tabela, mostrar só colaborador e ações */
  #adm-root .uos-table thead th:nth-child(2),
  #adm-root .uos-table thead th:nth-child(3),
  #adm-root .uos-table tbody td:nth-child(2),
  #adm-root .uos-table tbody td:nth-child(3) { display:none; }
}
`;
