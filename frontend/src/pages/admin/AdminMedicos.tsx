/**
 * Admin OS — Médicos / Enfermeiros CRUD page.
 * Replicates the mock at /originais/OS/admin-medicos.html.
 * Fetches real data from /users API filtered by Medico/Enfermeiro roles.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { usersApi } from '../../api/usersApi';
import { clinicsApi } from '../../api/clinicsApi';
import type { User, Clinic } from '../../types';

interface MedicoView {
  id: string;
  nome: string;
  iniciais: string;
  tipo: 'Médico' | 'Enfermeiro';
  registro: string;
  especialidade: string;
  upas: string[];
  biometria: 'Cadastrada' | 'Pendente';
  status: 'Ativo' | 'Inativo';
  cor: string;
}

const CORES = ['#6366f1','#2DBFB8','#22c55e','#f97316','#8b5cf6','#f59e0b','#3b82f6','#ef4444','#0f766e','#7c3aed','#059669','#be185d','#b45309','#6b7280'];

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskTel(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Custom dropdown with rounded styling */
function CustomSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="med-cselect" ref={ref}>
      <button className="med-cselect-btn" onClick={() => setOpen(!open)} type="button">
        <span>{selected?.label || '—'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="med-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`med-cselect-option ${o.value === value ? 'active' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

export function AdminMedicos({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterBio, setFilterBio] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 5;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [inactiveUsers, setInactiveUsers] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('plantonhub_inactive_users') || '[]')); }
    catch { return new Set(); }
  });

  // Form state
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTipo, setFormTipo] = useState('');
  const [formRegistro, setFormRegistro] = useState('');
  const [formEspecialidade, setFormEspecialidade] = useState('');
  const [formVinculo, setFormVinculo] = useState('CLT');
  const [formCpf, setFormCpf] = useState('');
  const [formTel, setFormTel] = useState('');
  const [formDob, setFormDob] = useState('');
  const [selectedClinics, setSelectedClinics] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([usersApi.getAll(), clinicsApi.getAll()])
      .then(([u, c]) => {
        setUsers(Array.isArray(u) ? u : []);
        setClinics(Array.isArray(c) ? c : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Transform users into MedicoView
  const medicos: MedicoView[] = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users
      .filter(u => {
        // Mostrar quem tem professionalType definido OU role Medico/Enfermeiro
        const hasType = u.professionalType === 'Medico' || u.professionalType === 'Enfermeiro';
        const roles = u.roles || [];
        const hasRole = roles.some((r: { role: string }) => r.role === 'Medico' || r.role === 'Enfermeiro');
        return hasType || hasRole;
      })
      .map((u, i) => {
        const roles = u.roles || [];
        const role = roles.find((r: { role: string }) => r.role === 'Medico' || r.role === 'Enfermeiro');
        // Prioridade: professionalType do user, depois deduz da role
        const tipo = u.professionalType === 'Enfermeiro' ? 'Enfermeiro'
          : u.professionalType === 'Medico' ? 'Médico'
          : role?.role === 'Enfermeiro' ? 'Enfermeiro' : 'Médico';
        const upas = roles
          .filter(r => r.role === 'Medico' || r.role === 'Enfermeiro')
          .map(r => clinics.find(c => c.id === r.clinicId)?.name || 'UPA')
          .filter((v, idx, arr) => arr.indexOf(v) === idx);
        const iniciais = u.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
        return {
          id: u.id,
          nome: u.name,
          iniciais,
          tipo,
          registro: u.registrationNumber || (tipo === 'Médico' ? 'CRM' : 'COREN'),
          especialidade: tipo === 'Enfermeiro' ? '—' : (u.specialty || '—'),
          upas,
          biometria: 'Pendente' as const,
          status: (u.isActive === false || inactiveUsers.has(u.id)) ? 'Inativo' as const : 'Ativo' as const,
          cor: CORES[i % CORES.length],
        };
      });
  }, [users, clinics, inactiveUsers]);

  // Filtered list
  const filtered = useMemo(() => {
    setPage(1); // reset page on filter change
    return medicos.filter(m => {
      if (search && !m.nome.toLowerCase().includes(search.toLowerCase()) && !m.registro.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTipo && m.tipo !== filterTipo) return false;
      if (filterBio && m.biometria !== filterBio) return false;
      if (filterStatus && m.status !== filterStatus) return false;
      return true;
    });
  }, [medicos, search, filterTipo, filterBio, filterStatus]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // KPIs
  const kpiTotal = medicos.length;
  const kpiMedicos = medicos.filter(m => m.tipo === 'Médico').length;
  const kpiEnfermeiros = medicos.filter(m => m.tipo === 'Enfermeiro').length;
  const kpiBioAtiva = medicos.filter(m => m.biometria === 'Cadastrada').length;
  const kpiBioPendente = medicos.filter(m => m.biometria === 'Pendente').length;
  const kpiInativos = medicos.filter(m => m.status === 'Inativo').length;

  function openDrawer(id?: string) {
    setEditingId(id || null);
    setDrawerStep(1);
    if (id) {
      const m = medicos.find(x => x.id === id);
      const u = users.find(x => x.id === id);
      if (m) {
        setFormNome(m.nome);
        setFormTipo(m.tipo);
        setFormRegistro(m.registro);
        setFormEspecialidade(m.especialidade === '—' ? '' : m.especialidade);
      }
      if (u) {
        setFormEmail(u.email || '');
        setFormCpf(u.cpf ? maskCpf(u.cpf) : '');
        setFormTel(u.phone ? maskTel(u.phone) : '');
        setFormDob(u.dateOfBirth ? u.dateOfBirth.split('T')[0] : '');
        setFormVinculo(u.employmentType || 'CLT');
        // Pre-select clinics
        const clinicIds = (u.roles || []).map((r: { clinicId: string }) => r.clinicId);
        setSelectedClinics(clinicIds);
      }
    } else {
      setFormNome(''); setFormEmail(''); setFormTipo(''); setFormRegistro(''); setFormEspecialidade(''); setFormCpf(''); setFormTel(''); setFormDob(''); setFormVinculo('CLT'); setSelectedClinics([]);
    }
    setDrawerOpen(true);
  }

  function closeDrawer() { setDrawerOpen(false); }

  // Validação step 1 — todos obrigatórios
  const step1Valid = formNome.trim() !== '' && formEmail.trim() !== '' && formTipo !== '' && formRegistro.trim() !== '' && (formTipo === 'Enfermeiro' || formEspecialidade.trim() !== '') && formCpf.replace(/\D/g, '').length === 11 && formTel.replace(/\D/g, '').length >= 10;

  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    try {
      if (editingId) {
        // Backend PUT /api/users/{id} — accepts partial payload. Only the
        // fields the drawer surfaces are sent; email and password are
        // immutable via this endpoint (Cognito reset is a separate flow).
        const profType = formTipo === 'Médico' ? 1 : formTipo === 'Enfermeiro' ? 2 : undefined;
        await usersApi.update(editingId, {
          name: formNome.trim() || undefined,
          professionalType: profType,
          cpf: formCpf.replace(/\D/g, '') || undefined,
          phone: formTel.replace(/\D/g, '') || undefined,
          registrationNumber: formRegistro.trim() || undefined,
          specialty: formTipo === 'Enfermeiro' ? undefined : (formEspecialidade.trim() || undefined),
          employmentType: formVinculo || undefined,
          dateOfBirth: formDob || undefined,
        });

        // Refresh user list so the table reflects the edit
        const refreshed = await usersApi.getAll();
        setUsers(Array.isArray(refreshed) ? refreshed : []);

        closeDrawer();
        showToast('Profissional atualizado com sucesso!');
      } else {
        // Create user
        const profType = formTipo === 'Médico' ? 1 : formTipo === 'Enfermeiro' ? 2 : undefined;
        const newUser = await usersApi.create({
          email: formEmail.trim(),
          name: formNome.trim(),
          password: 'Temp@' + Date.now(), // Temporary password — user will reset
          professionalType: profType,
          cpf: formCpf.replace(/\D/g, '') || undefined,
          phone: formTel.replace(/\D/g, '') || undefined,
          registrationNumber: formRegistro.trim() || undefined,
          specialty: formTipo === 'Enfermeiro' ? undefined : (formEspecialidade.trim() || undefined),
          employmentType: formVinculo || undefined,
          dateOfBirth: formDob || undefined,
        });

        // Assign role (Medico or Enfermeiro) to selected clinics
        const roleNum = formTipo === 'Médico' ? 2 : 3; // RoleType enum: Medico=2, Enfermeiro=3
        const selectedClinicIds = selectedClinics.length > 0 ? selectedClinics : (clinics[0] ? [clinics[0].id] : []);

        for (const clinicId of selectedClinicIds) {
          await usersApi.assignRole(newUser.id, { clinicId, role: roleNum as unknown as 'Medico' | 'Enfermeiro' });
        }

        // Refresh user list
        const refreshed = await usersApi.getAll();
        setUsers(Array.isArray(refreshed) ? refreshed : []);

        closeDrawer();
        showToast('Profissional cadastrado com sucesso!');
      }
    } catch (err: unknown) {
      let msg = 'Erro ao salvar';
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { data?: { detail?: string }; status?: number } }).response;
        if (resp?.status === 409) msg = 'Este e-mail já está cadastrado.';
        else if (resp?.data?.detail) msg = resp.data.detail;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      showToast(msg, true);
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg: string, isError = false) {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(''), 3500);
  }

  async function toggleUserStatus(userId: string, nome: string) {
    try {
      await usersApi.toggleStatus(userId);
      // Refresh users
      const refreshed = await usersApi.getAll();
      setUsers(Array.isArray(refreshed) ? refreshed : []);
      const user = refreshed.find((u: { id: string }) => u.id === userId);
      if (user && user.isActive === false) {
        showToast(`${nome} inativado. Login bloqueado.`);
      } else {
        showToast(`${nome} reativado com sucesso!`);
      }
    } catch {
      // Fallback local
      const newSet = new Set(inactiveUsers);
      if (newSet.has(userId)) {
        newSet.delete(userId);
        showToast(`${nome} reativado com sucesso!`);
      } else {
        newSet.add(userId);
        showToast(`${nome} inativado. Login bloqueado.`);
      }
      setInactiveUsers(newSet);
      localStorage.setItem('plantonhub_inactive_users', JSON.stringify([...newSet]));
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MEDICOS_CSS }} />
      <div className="med-topbar">
        <div className="med-topbar-left">
          <button className="med-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="med-topbar-title">Médicos e Enfermeiros</div>
            <div className="med-topbar-sub">Cadastro completo com biometria facial para check-in/check-out</div>
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
      <div className="med-content">
        <div className="med-page-header">
          <div>
            <div className="med-page-title">Equipe Médica</div>
            <div className="med-page-sub">Gerencie dados, vínculos e biometria de todos os profissionais</div>
          </div>
          <button className="med-btn-novo" onClick={() => openDrawer()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo profissional
          </button>
        </div>

        {/* KPIs */}
        <div className="med-kpi-strip">
          <div className="med-kpi indigo"><div className="med-kpi-lbl">Total cadastrados</div><div className="med-kpi-val">{loading ? '—' : kpiTotal}</div><div className="med-kpi-sub">profissionais</div></div>
          <div className="med-kpi teal"><div className="med-kpi-lbl">Médicos</div><div className="med-kpi-val">{loading ? '—' : kpiMedicos}</div><div className="med-kpi-sub">CRM registrado</div></div>
          <div className="med-kpi purple"><div className="med-kpi-lbl">Enfermeiros</div><div className="med-kpi-val">{loading ? '—' : kpiEnfermeiros}</div><div className="med-kpi-sub">COREN registrado</div></div>
          <div className="med-kpi green"><div className="med-kpi-lbl">Biometria ativa</div><div className="med-kpi-val">{loading ? '—' : kpiBioAtiva}</div><div className="med-kpi-sub">acesso liberado</div></div>
          <div className="med-kpi yellow"><div className="med-kpi-lbl">Bio pendente</div><div className="med-kpi-val">{loading ? '—' : kpiBioPendente}</div><div className="med-kpi-sub">aguardando captura</div></div>
          <div className="med-kpi red"><div className="med-kpi-lbl">Inativos</div><div className="med-kpi-val">{loading ? '—' : kpiInativos}</div><div className="med-kpi-sub">acesso suspenso</div></div>
        </div>

        {/* Filtros */}
        <div className="med-filter-bar">
          <div className="med-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="med-search-input" type="text" placeholder="Buscar por nome, CRM ou COREN..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect value={filterTipo} onChange={setFilterTipo} options={[{ value: '', label: 'Médicos e enfermeiros' }, { value: 'Médico', label: 'Somente médicos' }, { value: 'Enfermeiro', label: 'Somente enfermeiros' }]} />
          <CustomSelect value={filterBio} onChange={setFilterBio} options={[{ value: '', label: 'Todas as biometrias' }, { value: 'Cadastrada', label: 'Biometria ativa' }, { value: 'Pendente', label: 'Biometria pendente' }]} />
          <CustomSelect value={filterStatus} onChange={setFilterStatus} options={[{ value: '', label: 'Todos os status' }, { value: 'Ativo', label: 'Ativo' }, { value: 'Inativo', label: 'Inativo' }]} />
        </div>

        {/* Tabela */}
        <div className="med-table-card">
          <div className="med-table-header-bar">
            <div className="med-table-title">Profissionais cadastrados</div>
            <div className="med-table-count">{filtered.length} profissiona{filtered.length !== 1 ? 'is' : 'l'}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="med-table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Tipo</th>
                  <th>Registro</th>
                  <th>Especialidade</th>
                  <th>UPAs autorizadas</th>
                  <th className="center">Biometria</th>
                  <th className="center">Status</th>
                  <th className="center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>Nenhum profissional encontrado.</td></tr>
                )}
                {paginated.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="med-td-user">
                        <div className="med-td-avatar" style={{ background: m.cor }}>{m.iniciais}</div>
                        <div><div className="med-td-name">{m.nome}</div><div className="med-td-sub">{m.especialidade}</div></div>
                      </div>
                    </td>
                    <td><span className={`med-badge ${m.tipo === 'Médico' ? 'med-badge-medico' : 'med-badge-enfermeiro'}`}>{m.tipo}</span></td>
                    <td style={{ fontWeight: 700, fontSize: '.78rem' }}>{m.registro}</td>
                    <td style={{ color: 'var(--muted)', fontWeight: 700 }}>{m.especialidade}</td>
                    <td><div className="med-upas-mini">{m.upas.map(u => <span key={u} className="med-upa-chip">{u}</span>)}</div></td>
                    <td className="center"><span className={`med-bio-badge ${m.biometria === 'Cadastrada' ? 'med-bio-ok' : 'med-bio-pendente'}`}>{m.biometria === 'Cadastrada' ? '✓ Cadastrada' : '⏳ Pendente'}</span></td>
                    <td className="center"><span className={`med-badge ${m.status === 'Ativo' ? 'med-badge-ativo' : 'med-badge-inativo'}`}>{m.status}</span></td>
                    <td className="center">
                      <div className="med-actions-cell">
                        <button className="med-act-btn" title="Editar" onClick={() => openDrawer(m.id)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="med-act-btn med-bio-btn" title="Biometria" onClick={() => { openDrawer(m.id); setTimeout(() => setDrawerStep(3), 50); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </button>
                        <button className={`med-act-btn ${m.status === 'Ativo' ? 'med-danger' : 'med-activate'}`} title={m.status === 'Ativo' ? 'Inativar' : 'Reativar'} onClick={() => toggleUserStatus(m.id, m.nome)}>
                          {m.status === 'Ativo' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="med-pagination">
            <div className="med-pag-info">Exibindo {Math.min((page - 1) * perPage + 1, filtered.length)}–{Math.min(page * perPage, filtered.length)} de {filtered.length} profissionais</div>
            <div className="med-pag-btns">
              <button className="med-pag-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} className={`med-pag-btn ${page === i + 1 ? 'active' : ''}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
              <button className="med-pag-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && <div className="med-overlay" onClick={closeDrawer} />}
      <div className={`med-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="med-drawer-header">
          <div className="med-drawer-title">{editingId ? 'Editar profissional' : 'Novo profissional'}</div>
          <button className="med-drawer-close" onClick={closeDrawer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Steps */}
        <div className="med-drawer-steps">
          <div className={`med-step ${drawerStep === 1 ? 'active' : drawerStep > 1 ? 'done' : ''}`} onClick={() => setDrawerStep(1)}>
            <div className="med-step-circle">{drawerStep > 1 ? '✓' : '1'}</div>
            <div className="med-step-label">Dados pessoais</div>
          </div>
          <div className="med-step-sep" />
          <div className={`med-step ${drawerStep === 2 ? 'active' : drawerStep > 2 ? 'done' : ''}`} onClick={() => setDrawerStep(2)}>
            <div className="med-step-circle">{drawerStep > 2 ? '✓' : '2'}</div>
            <div className="med-step-label">Vínculos</div>
          </div>
          <div className="med-step-sep" />
          <div className={`med-step ${drawerStep === 3 ? 'active' : ''}`} onClick={() => setDrawerStep(3)}>
            <div className="med-step-circle">3</div>
            <div className="med-step-label">Biometria</div>
          </div>
        </div>

        <div className="med-drawer-body">
          {/* Step 1 */}
          {drawerStep === 1 && (
            <div className="med-form-section">
              <div className="med-form-section-title">Dados pessoais</div>
              <div className="med-form-row">
                <div className="med-field"><label>Nome completo</label><input type="text" placeholder="Ex: Dra. Jessica Lima" value={formNome} onChange={e => setFormNome(e.target.value)} /></div>
                <div className="med-field"><label>Data de nascimento</label><input type="date" value={formDob} onChange={e => setFormDob(e.target.value)} /></div>
              </div>
              <div className="med-form-row">
                <div className="med-field"><label>CPF</label><input type="text" placeholder="000.000.000-00" value={formCpf} onChange={e => setFormCpf(maskCpf(e.target.value))} maxLength={14} /></div>
                <div className="med-field"><label>Telefone</label><input type="text" placeholder="(11) 99999-9999" value={formTel} onChange={e => setFormTel(maskTel(e.target.value))} maxLength={15} /></div>
              </div>
              <div className="med-form-row full">
                <div className="med-field"><label>E-mail</label><input type="email" placeholder="profissional@email.com" value={formEmail} onChange={e => setFormEmail(e.target.value)} /></div>
              </div>
              <div className="med-form-section-title" style={{ marginTop: '1.4rem' }}>Dados profissionais</div>
              <div className="med-form-row">
                <div className="med-field"><label>Tipo</label>
                  <CustomSelect value={formTipo} onChange={setFormTipo} options={[{ value: '', label: 'Selecione...' }, { value: 'Médico', label: 'Médico' }, { value: 'Enfermeiro', label: 'Enfermeiro' }]} />
                </div>
                <div className="med-field"><label>CRM / COREN</label><input type="text" placeholder="Ex: 5485-SP" value={formRegistro} onChange={e => setFormRegistro(e.target.value.replace(/\s/g, ''))} /></div>
              </div>
              <div className="med-form-row">
                {formTipo !== 'Enfermeiro' && (
                  <div className="med-field"><label>Especialidade</label><input type="text" placeholder="Ex: Clínica Geral" value={formEspecialidade} onChange={e => setFormEspecialidade(e.target.value)} /></div>
                )}
                <div className="med-field"><label>Vínculo</label>
                  <CustomSelect value={formVinculo} onChange={setFormVinculo} options={[{ value: 'CLT', label: 'CLT' }, { value: 'PJ', label: 'PJ' }, { value: 'Estatutário', label: 'Estatutário' }, { value: 'Temporário', label: 'Temporário' }]} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {drawerStep === 2 && (
            <div className="med-form-section">
              <div className="med-form-section-title">UPAs autorizadas</div>
              <p style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '.9rem' }}>Selecione as unidades em que este profissional poderá realizar check-in.</p>
              <div className="med-upas-check">
                {clinics.map(c => (
                  <label key={c.id} className="med-upa-check-item">
                    <input type="checkbox" checked={selectedClinics.includes(c.id)} onChange={e => {
                      if (e.target.checked) setSelectedClinics([...selectedClinics, c.id]);
                      else setSelectedClinics(selectedClinics.filter(id => id !== c.id));
                    }} />
                    <span className="med-upa-check-label">{c.name}</span>
                    <span className="med-upa-check-sub">{c.address}</span>
                  </label>
                ))}
                {clinics.length === 0 && <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Nenhuma UPA cadastrada.</p>}
              </div>
            </div>
          )}

          {/* Step 3 */}
          {drawerStep === 3 && (
            <div className="med-form-section">
              <div className="med-form-section-title">Cadastro de Biometria Facial</div>
              <p style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '1rem' }}>
                O template facial é necessário para que o profissional possa realizar check-in e check-out nas UPAs.
              </p>
              <div className="med-bio-panel">
                <div className="med-bio-oval-wrap">
                  <div className="med-bio-oval" />
                  <div className="med-bio-scan-line" />
                  <div className="med-bio-figure">
                    <svg width="70" height="80" viewBox="0 0 70 80" fill="none">
                      <circle cx="35" cy="22" r="18" fill="#2DBFB8" opacity=".5"/>
                      <path d="M5 80 C5 55 15 45 35 45 C55 45 65 55 65 80Z" fill="#2DBFB8" opacity=".5"/>
                      <circle cx="27" cy="19" r="2" fill="white" opacity=".6"/>
                      <circle cx="43" cy="19" r="2" fill="white" opacity=".6"/>
                    </svg>
                  </div>
                </div>
                <div className="med-bio-status">Posicione o rosto no oval e clique em Capturar</div>
                <button className="med-btn-bio">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Capturar biometria
                </button>
              </div>
              <div className="med-bio-info-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div>Os dados biométricos são processados via <strong>Azure Face API</strong> e armazenados de forma criptografada, em conformidade com a LGPD.</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="med-drawer-footer">
          {drawerStep > 1 && <button className="med-btn-prev" onClick={() => setDrawerStep(drawerStep - 1)}>← Voltar</button>}
          {drawerStep === 1 && <button className="med-btn-next" disabled={!step1Valid} onClick={() => setDrawerStep(2)}>Próximo →</button>}
          {drawerStep === 2 && <button className="med-btn-next" onClick={() => setDrawerStep(3)}>Próximo →</button>}
          {drawerStep === 3 && <button className="med-btn-salvar" disabled={saving} onClick={salvar}>{saving ? 'Salvando...' : 'Salvar profissional'}</button>}
        </div>
      </div>

      {/* Toast */}
      <div className={`med-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>
    </>
  );
}

const MEDICOS_CSS = `
/* Scoped to #adm-root */
#adm-root .med-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .med-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .med-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .med-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .med-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .med-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .med-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .med-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .med-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .med-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .med-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s; }
#adm-root .med-btn-novo:hover { transform:translateY(-1px); }
#adm-root .med-kpi-strip { display:grid; grid-template-columns:repeat(6,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .med-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .med-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .med-kpi.indigo::after { background:var(--indigo); }
#adm-root .med-kpi.teal::after { background:var(--teal); }
#adm-root .med-kpi.green::after { background:var(--green); }
#adm-root .med-kpi.yellow::after { background:var(--yellow); }
#adm-root .med-kpi.red::after { background:var(--red); }
#adm-root .med-kpi.purple::after { background:var(--purple); }
#adm-root .med-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .med-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .med-kpi.indigo .med-kpi-val { color:var(--indigo); }
#adm-root .med-kpi.teal .med-kpi-val { color:var(--teal); }
#adm-root .med-kpi.green .med-kpi-val { color:var(--green); }
#adm-root .med-kpi.yellow .med-kpi-val { color:var(--yellow); }
#adm-root .med-kpi.red .med-kpi-val { color:var(--red); }
#adm-root .med-kpi.purple .med-kpi-val { color:var(--purple); }
#adm-root .med-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .med-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .med-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .med-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .med-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .med-search-input:focus { border-color:var(--indigo); }
#adm-root .med-filter-select { appearance:none; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:.65rem 2.2rem .65rem .9rem; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); outline:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .7rem center; }
#adm-root .med-table-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .med-table-header-bar { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .med-table-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .med-table-count { font-size:.72rem; font-weight:700; color:var(--muted); }
#adm-root .med-table { width:100%; border-collapse:collapse; }
#adm-root .med-table thead tr { background:var(--bg); border-bottom:1px solid var(--border); }
#adm-root .med-table thead th { padding:.75rem 1.1rem; font-size:.63rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); text-align:left; white-space:nowrap; }
#adm-root .med-table thead th.center { text-align:center; }
#adm-root .med-table tbody tr { border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .med-table tbody tr:last-child { border-bottom:none; }
#adm-root .med-table tbody tr:hover { background:#f9f9fc; }
#adm-root .med-table tbody td { padding:.85rem 1.1rem; font-size:.82rem; font-weight:600; color:var(--text); vertical-align:middle; }
#adm-root .med-table tbody td.center { text-align:center; }
#adm-root .med-td-user { display:flex; align-items:center; gap:.75rem; }
#adm-root .med-td-avatar { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .med-td-name { font-weight:800; color:var(--text); line-height:1.2; }
#adm-root .med-td-sub { font-size:.7rem; font-weight:600; color:var(--muted); }
#adm-root .med-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .med-badge-ativo { background:var(--green-light); color:#16a34a; }
#adm-root .med-badge-inativo { background:var(--red-light); color:#dc2626; }
#adm-root .med-badge-medico { background:var(--teal-light); color:#0d6d68; }
#adm-root .med-badge-enfermeiro { background:var(--purple-light); color:#6d28d9; }
#adm-root .med-bio-badge { display:inline-flex; align-items:center; gap:.35rem; font-size:.68rem; font-weight:800; padding:.3rem .75rem; border-radius:20px; white-space:nowrap; }
#adm-root .med-bio-ok { background:var(--green-light); color:#16a34a; }
#adm-root .med-bio-pendente { background:var(--yellow-light); color:#b45309; }
#adm-root .med-upas-mini { display:flex; gap:.3rem; flex-wrap:wrap; }
#adm-root .med-upa-chip { font-size:.62rem; font-weight:700; padding:.15rem .5rem; border-radius:6px; background:var(--bg); color:var(--muted); }
#adm-root .med-actions-cell { display:flex; align-items:center; justify-content:center; gap:.4rem; }
#adm-root .med-act-btn { width:30px; height:30px; border-radius:8px; border:1.5px solid var(--border); background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted); transition:all .15s; }
#adm-root .med-act-btn:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .med-bio-btn:hover { border-color:var(--teal); color:var(--teal); background:var(--teal-light); }
#adm-root .med-danger:hover { border-color:var(--red); color:var(--red); background:var(--red-light); }
#adm-root .med-activate:hover { border-color:var(--green); color:var(--green); background:var(--green-light); }
#adm-root .med-pagination { padding:1rem 1.4rem; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .med-pag-info { font-size:.72rem; font-weight:600; color:var(--muted); }
#adm-root .med-pag-btns { display:flex; gap:.4rem; }
#adm-root .med-pag-btn { width:32px; height:32px; border-radius:8px; border:1.5px solid var(--border); background:none; font-family:'Nunito',sans-serif; font-size:.8rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; display:flex; align-items:center; justify-content:center; }
#adm-root .med-pag-btn:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .med-pag-btn.active { background:var(--indigo); border-color:var(--indigo); color:#fff; }
#adm-root .med-pag-btn:disabled { opacity:.4; cursor:not-allowed; }
#adm-root .med-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; }
#adm-root .med-drawer { position:fixed; top:0; right:0; bottom:0; width:560px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .med-drawer.open { transform:translateX(0); }
#adm-root .med-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .med-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .med-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .med-drawer-close:hover { color:var(--text); }
#adm-root .med-drawer-steps { display:flex; padding:.9rem 1.6rem; border-bottom:1px solid var(--border); gap:.4rem; flex-shrink:0; }
#adm-root .med-step { display:flex; align-items:center; gap:.5rem; flex:1; cursor:pointer; }
#adm-root .med-step-circle { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:900; flex-shrink:0; border:2px solid var(--border); color:var(--muted); background:#fff; transition:all .2s; }
#adm-root .med-step-label { font-size:.72rem; font-weight:800; color:var(--muted); transition:color .2s; }
#adm-root .med-step.active .med-step-circle { background:var(--indigo); border-color:var(--indigo); color:#fff; }
#adm-root .med-step.active .med-step-label { color:var(--indigo); }
#adm-root .med-step.done .med-step-circle { background:var(--green); border-color:var(--green); color:#fff; }
#adm-root .med-step.done .med-step-label { color:var(--green); }
#adm-root .med-step-sep { flex:1; height:2px; background:var(--border); border-radius:2px; margin:0 .3rem; align-self:center; }
#adm-root .med-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .med-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; flex-shrink:0; }
#adm-root .med-form-section { margin-bottom:1.4rem; }
#adm-root .med-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--indigo); margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid var(--indigo-light); }
#adm-root .med-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; margin-bottom:.9rem; }
#adm-root .med-form-row.full { grid-template-columns:1fr; }
#adm-root .med-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .med-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .med-field input, #adm-root .med-field select, #adm-root .med-field textarea { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .med-field input:focus, #adm-root .med-field select:focus { border-color:var(--indigo); background:#fff; }
#adm-root .med-field select { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .8rem center; background-color:var(--bg); cursor:pointer; }
#adm-root .med-upas-check { display:flex; flex-direction:column; gap:.5rem; }
#adm-root .med-upa-check-item { display:flex; align-items:center; gap:.7rem; padding:.65rem .9rem; background:var(--bg); border-radius:10px; cursor:pointer; transition:background .15s; }
#adm-root .med-upa-check-item:hover { background:var(--indigo-light); }
#adm-root .med-upa-check-item input { accent-color:var(--indigo); width:16px; height:16px; cursor:pointer; }
#adm-root .med-upa-check-label { font-size:.82rem; font-weight:700; color:var(--text); }
#adm-root .med-upa-check-sub { font-size:.65rem; font-weight:600; color:var(--muted); margin-left:auto; }
#adm-root .med-bio-panel { background:#0d1b1b; border-radius:18px; padding:2rem; display:flex; flex-direction:column; align-items:center; gap:1.2rem; position:relative; overflow:hidden; }
#adm-root .med-bio-panel::before { content:''; position:absolute; inset:0; background-image:radial-gradient(rgba(45,191,184,.08) 1.5px,transparent 1.5px); background-size:24px 24px; }
#adm-root .med-bio-oval-wrap { position:relative; width:180px; height:220px; }
#adm-root .med-bio-oval { width:100%; height:100%; border-radius:50%; border:3px dashed var(--teal); background:rgba(45,191,184,.05); animation:pulse-oval 2s ease-in-out infinite; }
@keyframes pulse-oval { 0%,100%{box-shadow:0 0 0 0 rgba(45,191,184,.2)} 50%{box-shadow:0 0 0 10px rgba(45,191,184,.05)} }
#adm-root .med-bio-scan-line { position:absolute; left:5%; right:5%; height:2px; background:linear-gradient(90deg,transparent,var(--teal),transparent); top:10%; border-radius:2px; animation:bio-scan 2.5s ease-in-out infinite; }
@keyframes bio-scan { 0%{top:10%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:88%;opacity:0} }
#adm-root .med-bio-figure { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
#adm-root .med-bio-status { font-size:.82rem; font-weight:800; color:var(--teal); text-align:center; position:relative; z-index:1; }
#adm-root .med-btn-bio { display:flex; align-items:center; gap:.5rem; padding:.75rem 1.5rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--teal),#1a8a85); box-shadow:0 4px 16px rgba(45,191,184,.35); transition:transform .14s; position:relative; z-index:1; }
#adm-root .med-btn-bio:hover { transform:translateY(-1px); }
#adm-root .med-bio-info-box { background:var(--indigo-light); border:1px solid rgba(99,102,241,.2); border-radius:12px; padding:.9rem 1.1rem; margin-top:1rem; display:flex; gap:.7rem; align-items:flex-start; font-size:.75rem; font-weight:600; color:var(--indigo-dark); line-height:1.5; }
#adm-root .med-btn-next { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); transition:transform .14s; }
#adm-root .med-btn-next:hover { transform:translateY(-1px); }
#adm-root .med-btn-next:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
#adm-root .med-btn-salvar { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); box-shadow:0 3px 12px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .med-btn-salvar:hover { transform:translateY(-1px); }
#adm-root .med-btn-prev { padding:.85rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; transition:border-color .15s; }
#adm-root .med-btn-prev:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .med-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; display:flex; align-items:center; gap:.7rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .med-toast.show { transform:translateY(0); opacity:1; }
#adm-root .med-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }

/* Custom Select */
#adm-root .med-cselect { position:relative; }
#adm-root .med-cselect-btn { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.65rem 1rem .65rem .9rem; border:1.5px solid var(--border); border-radius:12px; background:var(--surface); font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); cursor:pointer; transition:border-color .2s; white-space:nowrap; width:100%; }
#adm-root .med-field .med-cselect-btn { padding:.7rem .9rem; border-radius:10px; background:var(--bg); font-size:.85rem; }
#adm-root .med-field .med-cselect { width:100%; }
#adm-root .med-field .med-cselect-dropdown { min-width:100%; }
#adm-root .med-cselect-btn:hover { border-color:var(--indigo); }
#adm-root .med-cselect-btn svg { color:var(--indigo); flex-shrink:0; }
#adm-root .med-cselect-dropdown { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:60; overflow:hidden; animation:fadeUp .15s ease; }
#adm-root .med-cselect-option { padding:.6rem 1rem; font-size:.8rem; font-weight:600; color:var(--text); cursor:pointer; transition:background .12s; }
#adm-root .med-cselect-option:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .med-cselect-option.active { background:var(--indigo); color:#fff; font-weight:800; }

/* Dark mode overrides */
#adm-root.dark .med-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .med-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .med-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .med-search-input:focus { border-color:var(--indigo); background:#1a1f36; }
#adm-root.dark .med-filter-select { background-color:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a5b4fc' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .7rem center; }
#adm-root.dark .med-filter-select option { background:#1a1f36; color:#e2e8f0; }
#adm-root.dark .med-filter-select option:checked { background:var(--indigo); color:#fff; }
#adm-root.dark .med-table-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .med-table thead tr { background:#0f1119; }
#adm-root.dark .med-table tbody tr:hover { background:rgba(255,255,255,.03); }
#adm-root.dark .med-table tbody tr { border-bottom-color:rgba(255,255,255,.04); }
#adm-root.dark .med-drawer { background:#1a1f36; }
#adm-root.dark .med-drawer-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .med-drawer-steps { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .med-drawer-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .med-step-circle { background:#0f1119; border-color:rgba(255,255,255,.15); color:#94a3b8; }
#adm-root.dark .med-field input, #adm-root.dark .med-field select, #adm-root.dark .med-field textarea { background-color:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .med-field input:focus, #adm-root.dark .med-field select:focus { border-color:var(--indigo); background-color:#0f1119; }
#adm-root.dark .med-field select { background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a5b4fc' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .8rem center; }
#adm-root.dark .med-field select option { background:#1a1f36; color:#e2e8f0; }
#adm-root.dark .med-field select option:hover, #adm-root.dark .med-field select option:checked { background:var(--indigo); color:#fff; }
#adm-root.dark .med-field input::placeholder, #adm-root.dark .med-field textarea::placeholder { color:#64748b; }
#adm-root.dark .med-upa-check-item { background:#0f1119; }
#adm-root.dark .med-upa-check-item:hover { background:rgba(99,102,241,.15); }
#adm-root.dark .med-upa-chip { background:#0f1119; color:#94a3b8; }
#adm-root.dark .med-form-section-title { border-bottom-color:rgba(99,102,241,.2); }
#adm-root.dark .med-pagination { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .med-table-header-bar { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .med-badge-medico { background:rgba(45,191,184,.15); color:#5eead4; }
#adm-root.dark .med-badge-enfermeiro { background:rgba(139,92,246,.15); color:#c4b5fd; }
#adm-root.dark .med-cselect-btn { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .med-field .med-cselect-btn { background:#0f1119; }
#adm-root.dark .med-cselect-btn:hover { border-color:var(--indigo); }
#adm-root.dark .med-cselect-btn svg { color:#a5b4fc; }
#adm-root.dark .med-cselect-dropdown { background:#1a1f36; border-color:rgba(255,255,255,.1); box-shadow:0 8px 24px rgba(0,0,0,.4); }
#adm-root.dark .med-cselect-option { color:#e2e8f0; }
#adm-root.dark .med-cselect-option:hover { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .med-cselect-option.active { background:var(--indigo); color:#fff; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .med-hamburger { display:flex; }
  #adm-root .med-topbar { padding:.85rem 1rem; }
  #adm-root .med-content { padding:1rem; }
  #adm-root .med-page-header { flex-direction:column; align-items:flex-start; gap:.75rem; }
  #adm-root .med-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .med-filter-bar { flex-direction:column; align-items:stretch; gap:.6rem; }
  #adm-root .med-search-wrap { min-width:unset; }
  #adm-root .med-cselect { min-width:unset; width:100%; }
  #adm-root .med-table { font-size:.78rem; }
  #adm-root .med-table thead th { padding:.6rem .75rem; font-size:.58rem; }
  #adm-root .med-table tbody td { padding:.7rem .75rem; }
  #adm-root .med-drawer { width:100vw; }
  #adm-root .med-form-row { grid-template-columns:1fr; }
  #adm-root .med-kpi-val { font-size:1.5rem; }
}
@media (max-width: 480px) {
  #adm-root .med-kpi-strip { grid-template-columns:1fr 1fr; gap:.5rem; }
  #adm-root .med-kpi-card { padding:.75rem; }
  #adm-root .med-table-card { border-radius:12px; }
  /* hide less important columns */
  #adm-root .med-table thead th:nth-child(4),
  #adm-root .med-table thead th:nth-child(5),
  #adm-root .med-table tbody td:nth-child(4),
  #adm-root .med-table tbody td:nth-child(5) { display:none; }
}
`;
