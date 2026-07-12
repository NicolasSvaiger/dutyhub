/**
 * Admin OS — Welcome page.
 * Fetches real data from backend APIs (clinics, users, shifts, notifications).
 * Falls back to skeleton/loading state while data loads.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { adminApi, type AdminDashboardSummary } from '../../api/adminApi';
import { AdminMedicos } from './AdminMedicos';
import { AdminEscalas } from './AdminEscalas';

type AdminView = 'home' | 'medicos' | 'escalas';

export function AdminPage() {
  const [dark, setDark] = useState(false);
  const [activeView, setActiveView] = useState<AdminView>('home');
  const { user, logout } = useAuth();
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');

  useEffect(() => {
    let cancelled = false;
    adminApi.getDashboardSummary()
      .then(result => { if (!cancelled) setData(result); })
      .catch(() => { /* graceful — keeps loading state or shows zeros */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Derive display values
  const userName = user?.name || 'Administrador';
  const userEmail = user?.email || '';
  const userInitials = userName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const clinicCount = data?.clinics.length ?? 0;

  const kpis = data?.kpis ?? { activeContracts: 0, registeredDoctors: 0, shiftsToday: 0, shiftsConfirmedToday: 0, pendingAlerts: 0 };

  return (
    <div id="adm-root" className={dark ? 'dark' : ''}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg width="36" height="36" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="rgba(99,102,241,.6)"/><stop offset="100%" stopColor="rgba(45,191,184,.5)"/></linearGradient></defs>
            <circle cx="44" cy="44" r="44" fill="url(#sg)"/>
            <path d="M44 17 C33 17 24 26 24 37 C24 51 44 67 44 67 C44 67 64 51 64 37 C64 26 55 17 44 17Z" fill="rgba(255,255,255,.95)"/>
            <polyline points="31,37 36,37 39,31 42,43 45,35 48,41 51,37 57,37" fill="none" stroke="#2DBFB8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="37,24 42,30 52,20" fill="none" stroke="#6366f1" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div className="sidebar-logo-name">24p7</div>
            <div className="sidebar-logo-tag">Tecnologia para quem não para</div>
            <div className="sidebar-module">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Admin OS
            </div>
          </div>
        </div>

        <div className="nav-section-label">Principal</div>
        <a className={`nav-item ${activeView === 'home' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setActiveView('home'); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>
          Início
        </a>
        <a className="nav-item" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          Tempo Real
        </a>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Central de Alertas
        </a>

        <div className="nav-section-label">Cadastros</div>
        <a className="nav-item" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Usuários da OS
        </a>
        <a className="nav-item" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          Órgãos Públicos
        </a>
        <a className="nav-item" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Gestores do Órgão
        </a>
        <a className="nav-item" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          Unidades (UPAs)
        </a>
        <a className={`nav-item ${activeView === 'medicos' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setActiveView('medicos'); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M12 11v4"/><path d="M9 14h6"/></svg>
          Médicos / Enfermeiros
        </a>

        <div className="nav-section-label">Operacional</div>
        <a className={`nav-item ${activeView === 'escalas' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setActiveView('escalas'); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Escalas
        </a>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          Substituições
        </a>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Disponibilidade
        </a>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Justificativas
        </a>

        <div className="nav-section-label">Relatórios</div>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Gerencial
        </a>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Faturamento
        </a>

        <div className="nav-section-label">Sistema</div>
        <a className="nav-item" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2m0 18v-2m7.07 2.93-1.41-1.41M4.93 19.07l1.41-1.41M22 12h-2M4 12H2"/></svg>
          Configurações
        </a>
        <a className="nav-item disabled" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Auditoria
        </a>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{userInitials}</div>
            <div>
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">Administradora · OS</div>
            </div>
            <button className="logout-btn" title="Sair" onClick={() => { logout(); window.location.href = '/admin/login'; }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </aside>

      <main className={`main ${activeView !== 'home' ? 'scrollable' : ''}`}>
        {activeView === 'home' && (
          <>
        <div className="topbar">
          <div>
            <div className="topbar-title">Visão Geral</div>
            <div className="topbar-sub">{dateStr}</div>
          </div>
          <div className="topbar-right">
            <button className="theme-toggle" onClick={() => setDark(!dark)} title={dark ? 'Tema claro' : 'Tema escuro'}>
              {dark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <div className="topbar-badge"><div className="dot"></div>Sistema operacional</div>
          </div>
        </div>

        <div className="content">
          <div className="welcome-hero">
            <div className="welcome-mesh"></div>
            <div className="welcome-inner">
              <div className="welcome-greeting">👋 Bem-vindo(a) de volta</div>
              <div className="welcome-name">{userName}</div>
              <div className="welcome-email">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {userEmail}
              </div>
              <div className="welcome-tags">
                <div className="welcome-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                  Administradora da OS
                </div>
                <div className="welcome-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  {clinicCount} UPA{clinicCount !== 1 ? 's' : ''} sob gestão
                </div>
                <div className="welcome-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {h}h{m}
                </div>
              </div>
            </div>
          </div>

          <div className="kpi-strip">
            <div className="kpi-s indigo"><div className="kpi-lbl">Contratos ativos</div><div className="kpi-val">{loading ? '—' : kpis.activeContracts}</div><div className="kpi-sub">prefeituras atendidas</div></div>
            <div className="kpi-s teal"><div className="kpi-lbl">Médicos cadastrados</div><div className="kpi-val">{loading ? '—' : kpis.registeredDoctors}</div><div className="kpi-sub">com biometria ativa</div></div>
            <div className="kpi-s green"><div className="kpi-lbl">Plantões hoje</div><div className="kpi-val">{loading ? '—' : kpis.shiftsToday}</div><div className="kpi-sub">de {kpis.shiftsConfirmedToday} confirmados</div></div>
            <div className="kpi-s yellow"><div className="kpi-lbl">Alertas pendentes</div><div className="kpi-val">{loading ? '—' : kpis.pendingAlerts}</div><div className="kpi-sub">requerem atenção</div></div>
          </div>

          <div className="home-grid">
            <div>
              <div className="section-title">Acesso rápido</div>
              <div className="actions-grid">
                <a className="action-card" href="#">
                  <div className="action-icon indigo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M12 11v4"/><path d="M9 14h6"/></svg>
                  </div>
                  <div className="action-name">Médicos</div>
                  <div className="action-desc">Cadastrar e gerenciar médicos e biometria facial.</div>
                </a>
                <a className="action-card" href="#">
                  <div className="action-icon teal">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div className="action-name">Escalas</div>
                  <div className="action-desc">Criar e editar escalas de plantão por UPA e turno.</div>
                </a>
                <a className="action-card" href="#">
                  <div className="action-icon green">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div className="action-name">Tempo Real</div>
                  <div className="action-desc">Acompanhar check-ins e status das UPAs agora.</div>
                </a>
                <a className="action-card disabled" href="#">
                  <div className="action-icon yellow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  </div>
                  <div className="action-name">Substituições</div>
                  <div className="action-desc">Gerenciar trocas e reposições de plantões.</div>
                  <div className="action-soon">Em breve</div>
                </a>
                <a className="action-card" href="#">
                  <div className="action-icon purple">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                  </div>
                  <div className="action-name">Órgãos Públicos</div>
                  <div className="action-desc">Gerir contratos e acessos das prefeituras.</div>
                </a>
                <a className="action-card disabled" href="#">
                  <div className="action-icon red">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </div>
                  <div className="action-name">Relatórios</div>
                  <div className="action-desc">KPIs, faturamento e relatórios para a prefeitura.</div>
                  <div className="action-soon">Em breve</div>
                </a>
              </div>
            </div>

            <div>
              <div className="section-title">Alertas e atividades</div>
              <div className="alerts-card disabled-card">
                <div className="alerts-header"><div className="alerts-title">Central de alertas</div><div className="alerts-badge">{kpis.pendingAlerts} pendente{kpis.pendingAlerts !== 1 ? 's' : ''}</div></div>
                <div className="alert-list">
                  <div className="alert-item"><div className="alert-body"><div className="alert-text" style={{ color: 'var(--muted)' }}>Em breve</div></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
          </>
        )}
        {activeView === 'medicos' && <AdminMedicos onBack={() => setActiveView('home')} dark={dark} onToggleTheme={() => setDark(!dark)} />}
        {activeView === 'escalas' && <AdminEscalas onBack={() => setActiveView('home')} dark={dark} onToggleTheme={() => setDark(!dark)} />}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CSS copied verbatim from frontend/public/originais/OS/admin-welcome.html
   Scoped to #adm-root so it doesn't leak into the rest of the app.
   ═══════════════════════════════════════════════════════════════════ */
const CSS = `
#adm-root, #adm-root *, #adm-root *::before, #adm-root *::after { box-sizing: border-box; margin: 0; padding: 0; font: inherit; letter-spacing: inherit; line-height: inherit; color: inherit; }

#adm-root {
  all: initial;
  --teal: #2DBFB8;
  --teal-light: #e8faf9;
  --indigo: #6366f1;
  --indigo-dark: #4f46e5;
  --indigo-light: #eef2ff;
  --bg: #f4f5f9;
  --surface: #ffffff;
  --text: #1a1f36;
  --muted: #6b7280;
  --border: rgba(99,102,241,.14);
  --nav-w: 292px;
  --green: #22c55e;
  --green-light: #dcfce7;
  --yellow: #f59e0b;
  --yellow-light: #fef3c7;
  --red: #ef4444;
  --red-light: #fee2e2;
  --purple: #8b5cf6;
  --purple-light: #ede9fe;

  position: fixed;
  inset: 0;
  z-index: 9999;
  font-family: 'Nunito Sans', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  zoom: 0.889;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  display: flex;
  color-scheme: light;
}

/* SIDEBAR */
#adm-root .sidebar { position:fixed; top:0; left:0; bottom:0; width:var(--nav-w); background:#1a1f36; display:flex; flex-direction:column; padding:1.8rem 0; z-index:50; overflow-y:auto; }
#adm-root .sidebar-logo { display:flex; align-items:center; gap:.8rem; padding:0 1.5rem 1.8rem; border-bottom:1px solid rgba(255,255,255,.08); margin-bottom:1.4rem; }
#adm-root .sidebar-logo > svg { flex-shrink:0; min-width:36px; }
#adm-root .sidebar-logo > div { min-width:0; }
#adm-root .sidebar-logo-name { font-family:'Nunito',sans-serif; font-size:1.5rem; font-weight:900; color:#fff; letter-spacing:-1px; line-height:1; }
#adm-root .sidebar-logo-tag { font-size:.58rem; font-weight:700; color:rgba(255,255,255,.45); letter-spacing:.04em; line-height:1.3; white-space:nowrap; }
#adm-root .sidebar-module { display:inline-flex; align-items:center; gap:.3rem; background:rgba(99,102,241,.2); border:1px solid rgba(99,102,241,.3); border-radius:20px; padding:.18rem .55rem; font-size:.58rem; font-weight:800; color:#a5b4fc; letter-spacing:.06em; text-transform:uppercase; margin-top:4px; }
#adm-root .nav-section-label { font-size:.58rem; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,.3); padding:0 1.5rem; margin-bottom:.35rem; margin-top:.9rem; }
#adm-root .nav-item { display:flex; align-items:center; gap:.75rem; padding:.7rem 1.5rem; font-size:.83rem; font-weight:700; color:rgba(255,255,255,.5); cursor:pointer; transition:all .15s; border-left:3px solid transparent; text-decoration:none; }
#adm-root .nav-item:hover { background:rgba(255,255,255,.06); color:rgba(255,255,255,.85); }
#adm-root .nav-item.active { background:rgba(99,102,241,.15); color:#a5b4fc; border-left-color:var(--indigo); }
#adm-root .nav-item svg { flex-shrink:0; opacity:.7; }
#adm-root .nav-item.active svg { opacity:1; }
#adm-root .sidebar-footer { margin-top:auto; padding:1.2rem 1.5rem 0; border-top:1px solid rgba(255,255,255,.08); }
#adm-root .sidebar-user { display:flex; align-items:center; gap:.75rem; }
#adm-root .sidebar-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, var(--indigo), var(--teal)); display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .sidebar-user-name { font-size:.78rem; font-weight:800; color:rgba(255,255,255,.85); line-height:1.2; }
#adm-root .sidebar-user-role { font-size:.62rem; font-weight:600; color:rgba(255,255,255,.4); }
#adm-root .logout-btn { background:none; border:none; color:rgba(255,255,255,.35); cursor:pointer; margin-left:auto; padding:4px; transition:color .15s; }
#adm-root .logout-btn:hover { color:rgba(255,255,255,.8); }

/* MAIN */
#adm-root .main { margin-left:var(--nav-w); height:100vh; display:flex; flex-direction:column; flex:1; overflow:hidden; }
#adm-root .main.scrollable { overflow-y:auto; }
#adm-root .topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:40; }
#adm-root .topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }
#adm-root .topbar-right { display:flex; align-items:center; gap:.8rem; }
#adm-root .topbar-badge { display:flex; align-items:center; gap:.4rem; background:var(--indigo-light); border:1px solid rgba(99,102,241,.2); border-radius:20px; padding:.3rem .85rem; font-size:.7rem; font-weight:800; color:var(--indigo); }
#adm-root .topbar-badge .dot { width:7px; height:7px; border-radius:50%; background:var(--indigo); animation:pulse-dot 1.5s ease infinite; }
@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }

#adm-root .content { flex:1; padding:2rem; overflow:hidden; animation:fadeUp .4s ease; display:flex; flex-direction:column; }
@keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }

/* WELCOME HERO */
#adm-root .welcome-hero { background:linear-gradient(135deg, #1a1f36 0%, #2d3561 55%, #3d4a8a 100%); border-radius:24px; padding:2.4rem 2.8rem; color:#fff; position:relative; overflow:hidden; margin-bottom:1.6rem; }
#adm-root .welcome-hero::before { content:''; position:absolute; width:320px; height:320px; border-radius:50%; border:50px solid rgba(255,255,255,.05); top:-130px; right:-80px; }
#adm-root .welcome-hero::after { content:''; position:absolute; width:200px; height:200px; border-radius:50%; border:30px solid rgba(99,102,241,.12); bottom:-70px; left:220px; }
#adm-root .welcome-mesh { position:absolute; inset:0; background-image:radial-gradient(rgba(255,255,255,.06) 1.5px, transparent 1.5px); background-size:24px 24px; }
#adm-root .welcome-inner { position:relative; z-index:1; }
#adm-root .welcome-greeting { font-size:.78rem; font-weight:700; opacity:.7; text-transform:uppercase; letter-spacing:.05em; margin-bottom:.4rem; }
#adm-root .welcome-name { font-family:'Nunito',sans-serif; font-size:2rem; font-weight:900; line-height:1.1; margin-bottom:.5rem; }
#adm-root .welcome-email { display:flex; align-items:center; gap:.4rem; font-size:.84rem; font-weight:600; opacity:.75; margin-bottom:1.8rem; }
#adm-root .welcome-tags { display:flex; gap:.7rem; flex-wrap:wrap; }
#adm-root .welcome-tag { display:flex; align-items:center; gap:.4rem; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:.45rem .85rem; font-size:.75rem; font-weight:700; }

/* KPI STRIP */
#adm-root .kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .kpi-s { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); padding:1.1rem 1.3rem; display:flex; flex-direction:column; gap:.3rem; position:relative; overflow:hidden; transition:transform .15s, box-shadow .15s; cursor:default; }
#adm-root .kpi-s:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(99,102,241,.1); }
#adm-root .kpi-s::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .kpi-s.indigo::after { background:var(--indigo); }
#adm-root .kpi-s.teal::after { background:var(--teal); }
#adm-root .kpi-s.green::after { background:var(--green); }
#adm-root .kpi-s.yellow::after { background:var(--yellow); }
#adm-root .kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
#adm-root .kpi-val { font-family:'Nunito',sans-serif; font-size:1.9rem; font-weight:900; line-height:1; }
#adm-root .kpi-s.indigo .kpi-val { color:var(--indigo); }
#adm-root .kpi-s.teal .kpi-val { color:var(--teal); }
#adm-root .kpi-s.green .kpi-val { color:var(--green); }
#adm-root .kpi-s.yellow .kpi-val { color:var(--yellow); }
#adm-root .kpi-sub { font-size:.68rem; font-weight:600; color:var(--muted); }

/* HOME GRID */
#adm-root .home-grid { display:grid; grid-template-columns:1fr 380px; gap:1.2rem; flex:1; min-height:0; }
#adm-root .home-grid > div:last-child { display:flex; flex-direction:column; min-height:0; }
#adm-root .section-title { font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:900; color:var(--text); margin-bottom:.9rem; }
#adm-root .actions-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:.9rem; }
#adm-root .action-card { background:var(--surface); border:1.5px solid var(--border); border-radius:18px; padding:1.3rem 1.2rem; cursor:pointer; transition:transform .15s, box-shadow .15s, border-color .15s; text-decoration:none; display:flex; flex-direction:column; gap:.6rem; }
#adm-root .action-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px rgba(99,102,241,.12); border-color:var(--indigo); }
#adm-root .action-icon { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; }
#adm-root .action-icon.indigo { background:var(--indigo-light); color:var(--indigo); }
#adm-root .action-icon.teal { background:var(--teal-light); color:var(--teal); }
#adm-root .action-icon.green { background:var(--green-light); color:var(--green); }
#adm-root .action-icon.yellow { background:var(--yellow-light); color:var(--yellow); }
#adm-root .action-icon.purple { background:var(--purple-light); color:var(--purple); }
#adm-root .action-icon.red { background:var(--red-light); color:var(--red); }
#adm-root .action-name { font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:900; color:var(--text); }
#adm-root .action-desc { font-size:.7rem; font-weight:600; color:var(--muted); line-height:1.4; }
#adm-root .action-card.disabled { opacity:.45; filter:blur(.5px); pointer-events:none; position:relative; }
#adm-root .action-card.disabled:hover { transform:none; box-shadow:none; border-color:var(--border); }
#adm-root .action-card.disabled .action-icon { position:relative; }
#adm-root .action-soon { font-size:.55rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--indigo); background:var(--indigo-light); padding:.12rem .4rem; border-radius:6px; position:absolute; top:.8rem; right:.8rem; }
#adm-root .nav-item.disabled { opacity:.4; pointer-events:none; filter:blur(.3px); }

/* ALERTS */
#adm-root .alerts-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; display:flex; flex-direction:column; max-height:100%; }
#adm-root .disabled-card { opacity:.45; filter:blur(.5px); pointer-events:none; }
#adm-root .alerts-header { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .alerts-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .alerts-badge { font-size:.65rem; font-weight:800; background:var(--red-light); color:var(--red); padding:.2rem .6rem; border-radius:10px; }
#adm-root .alert-list { overflow-y:auto; flex:1; min-height:0; }
#adm-root .alert-item { display:flex; align-items:flex-start; gap:.8rem; padding:.85rem 1.4rem; border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .alert-item:last-child { border-bottom:none; }
#adm-root .alert-item:hover { background:#fafafa; }
#adm-root .alert-dot-wrap { padding-top:3px; flex-shrink:0; }
#adm-root .alert-dot { width:9px; height:9px; border-radius:50%; }
#adm-root .alert-dot.red { background:var(--red); box-shadow:0 0 5px var(--red); }
#adm-root .alert-dot.yellow { background:var(--yellow); box-shadow:0 0 5px var(--yellow); }
#adm-root .alert-dot.green { background:var(--green); box-shadow:0 0 5px var(--green); }
#adm-root .alert-dot.indigo { background:var(--indigo); box-shadow:0 0 5px var(--indigo); }
#adm-root .alert-body { flex:1; }
#adm-root .alert-text { font-size:.78rem; font-weight:700; color:var(--text); line-height:1.4; }
#adm-root .alert-sub { font-size:.68rem; font-weight:600; color:var(--muted); margin-top:2px; }
#adm-root .alert-time { font-size:.65rem; font-weight:700; color:var(--muted); white-space:nowrap; }

/* SCROLLBAR */
#adm-root ::-webkit-scrollbar { width:6px; height:6px; }
#adm-root ::-webkit-scrollbar-track { background:transparent; }
#adm-root ::-webkit-scrollbar-thumb { background:rgba(99,102,241,.25); border-radius:3px; }
#adm-root ::-webkit-scrollbar-thumb:hover { background:rgba(99,102,241,.4); }
#adm-root .sidebar::-webkit-scrollbar-thumb { background:rgba(255,255,255,.12); }
#adm-root .sidebar::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.25); }
#adm-root .main { scrollbar-width:thin; scrollbar-color:rgba(99,102,241,.25) transparent; }
#adm-root .sidebar { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.12) transparent; }

/* THEME TOGGLE */
#adm-root .theme-toggle { display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:50%; border:1.5px solid var(--border); background:var(--surface); color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .theme-toggle:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }

/* ══ DARK THEME ══ */
#adm-root.dark {
  --bg: #0f1119;
  --surface: #1a1f36;
  color-scheme: dark;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --border: rgba(99,102,241,.2);
  --indigo-light: rgba(99,102,241,.15);
  --teal-light: rgba(45,191,184,.12);
  --green-light: rgba(34,197,94,.12);
  --yellow-light: rgba(245,158,11,.12);
  --red-light: rgba(239,68,68,.12);
  --purple-light: rgba(139,92,246,.12);
}
#adm-root.dark .sidebar { background:#0a0d14; }
#adm-root.dark .topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .action-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .action-card:hover { border-color:var(--indigo); box-shadow:0 8px 24px rgba(0,0,0,.3); }
#adm-root.dark .kpi-s { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .kpi-s:hover { box-shadow:0 6px 20px rgba(0,0,0,.3); }
#adm-root.dark .alerts-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .alert-item { border-bottom-color:rgba(255,255,255,.04); }
#adm-root.dark .alert-item:hover { background:rgba(255,255,255,.03); }
#adm-root.dark .theme-toggle { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .theme-toggle:hover { border-color:var(--indigo); color:var(--indigo); background:rgba(99,102,241,.15); }
#adm-root.dark .topbar-badge { background:rgba(99,102,241,.15); border-color:rgba(99,102,241,.3); }
`;
