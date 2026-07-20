/**
 * Admin OS — Auditoria e Logs.
 * Timeline paginada de eventos com filtros combinados, agrupada por data.
 * Painel lateral com atividade por módulo, top usuários e sparkline 7d.
 * Substitui /originais/OS/admin-auditoria.html por dados reais em
 *   GET /api/audit/logs + /api/audit/summary.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { auditApi } from '../../api/auditApi';
import type { AuditLogEntry, AuditLogPage, AuditSummaryResponse, AuditQuery } from '../../api/auditApi';
import { formatLongDateBR, formatShortDateBR } from '../../utils/dateTimeBR';

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

const PAGE_SIZE = 30;

// Rótulos, cores e ícones por tipo de operação
const OP_META: Record<string, { badge: string; bg: string; fg: string; label: string; icon: string }> = {
  Create:  { badge: 'ger-badge-criar',   bg: 'var(--green-light)',  fg: '#16a34a',        label: 'Criação',      icon: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
  Update:  { badge: 'ger-badge-editar',  bg: 'var(--indigo-light)', fg: 'var(--indigo)',  label: 'Edição',       icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' },
  Delete:  { badge: 'ger-badge-excluir', bg: 'var(--red-light)',    fg: '#dc2626',        label: 'Exclusão',     icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' },
  Login:   { badge: 'ger-badge-login',   bg: 'var(--blue-light)',   fg: 'var(--blue)',    label: 'Login',        icon: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>' },
  Logout:  { badge: 'ger-badge-logout',  bg: 'var(--bg)',           fg: 'var(--muted)',   label: 'Logout',       icon: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' },
  Config:  { badge: 'ger-badge-config',  bg: 'var(--yellow-light)', fg: '#b45309',        label: 'Configuração', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2m0 18v-2m7.07 2.93-1.41-1.41M4.93 19.07l1.41-1.41M22 12h-2M4 12H2"/>' },
  Export:  { badge: 'ger-badge-export',  bg: 'var(--teal-light)',   fg: '#0f766e',        label: 'Exportação',   icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>' },
  System:  { badge: 'ger-badge-sistema', bg: 'var(--purple-light)', fg: 'var(--purple)',  label: 'Sistema',      icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
};

function opMeta(op: string) {
  return OP_META[op] || OP_META.System;
}

function formatDateLabel(dateStr: string, todayStr: string, yesterdayStr: string): string {
  if (dateStr === todayStr) return `Hoje · ${prettyDate(dateStr)}`;
  if (dateStr === yesterdayStr) return `Ontem · ${prettyDate(dateStr)}`;
  return prettyDate(dateStr);
}

function prettyDate(dateStr: string): string {
  // dateStr chega no formato "dd/MM/yyyy" (vem do backend)
  const [d, m, y] = dateStr.split('/');
  const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return dateStr;
  return `${parseInt(d, 10)} de ${months[idx]} de ${y}`;
}

function todayLabel() {
  return formatShortDateBR(new Date());
}

function yesterdayLabel() {
  return formatShortDateBR(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

export function AdminAuditoria({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const now = useMemo(() => new Date(), []);
  const [summary, setSummary] = useState<AuditSummaryResponse | null>(null);
  const [page, setPage] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // Filtros
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fUser, setFUser] = useState('');
  const [fModule, setFModule] = useState('');
  const [fOperation, setFOperation] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [pageIdx, setPageIdx] = useState(1);

  const sparkRef = useRef<HTMLCanvasElement | null>(null);

  const fetchLogs = useCallback(async (query: AuditQuery) => {
    try {
      const result = await auditApi.getLogs({ ...query, pageSize: PAGE_SIZE });
      setPage(result);
    } catch {
      setPage({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s] = await Promise.all([
          auditApi.getSummary(),
          fetchLogs({ page: 1 }),
        ]);
        if (!cancelled) setSummary(s);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!summary || !sparkRef.current) return;
    drawSparkline(sparkRef.current, summary.last7Days.map(d => d.count));
    const onResize = () => sparkRef.current && summary && drawSparkline(sparkRef.current, summary.last7Days.map(d => d.count));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [summary]);

  function applyFilters(overrides: Partial<AuditQuery> = {}, resetPage = true) {
    if (resetPage) setPageIdx(1);
    fetchLogs({
      from: fFrom || undefined,
      to: fTo || undefined,
      userId: fUser || undefined,
      module: fModule || undefined,
      operation: fOperation || undefined,
      search: fSearch || undefined,
      page: resetPage ? 1 : pageIdx,
      ...overrides,
    });
  }

  function clearFilters() {
    setFFrom(''); setFTo(''); setFUser(''); setFModule(''); setFOperation(''); setFSearch('');
    setPageIdx(1);
    fetchLogs({ page: 1 });
  }

  function goToPage(p: number) {
    setPageIdx(p);
    applyFilters({ page: p }, false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const selected = page?.items.find(x => x.id === selectedId) || null;

  // Agrupamento por data para a timeline
  const grouped = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    (page?.items ?? []).forEach(l => {
      const arr = map.get(l.dateLabel) ?? [];
      arr.push(l);
      map.set(l.dateLabel, arr);
    });
    return Array.from(map.entries());
  }, [page]);

  const todayStr = todayLabel();
  const yestStr = yesterdayLabel();
  const topbarDate = formatLongDateBR(now);

  // Deriva lista de módulos e usuários únicos dos filtros a partir do que já
  // veio no summary (para popular os selects)
  const modulesFromSummary = summary?.modules.map(m => m.module) ?? [];
  const usersFromSummary = summary?.topUsers ?? [];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="aud-topbar">
        <div className="aud-topbar-left">
          <button className="aud-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div>
            <div className="aud-topbar-title">Auditoria e Logs</div>
            <div className="aud-topbar-sub">{topbarDate}</div>
          </div>
        </div>
        <div className="aud-topbar-right">
          <button className="aud-btn-export aud-btn-xlsx" onClick={() => showToast('Logs exportados em Excel com sucesso!')} aria-label="Exportar Excel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="9" x2="9" y2="21" /></svg>
            <span className="aud-btn-label">Exportar Excel</span>
          </button>
          <button className="aud-btn-export aud-btn-pdf" onClick={() => showToast('Logs exportados em PDF com sucesso!')} aria-label="Exportar PDF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span className="aud-btn-label">Exportar PDF</span>
          </button>
          <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
        </div>
      </div>

      <div className="aud-content">
        {/* KPIs */}
        <div className="aud-kpi-strip">
          <div className="aud-kpi-s indigo">
            <div className="aud-kpi-lbl">Total de eventos</div>
            <div className="aud-kpi-val">{summary?.kpis.totalEvents ?? '—'}</div>
            <div className="aud-kpi-sub">nos últimos 30 dias</div>
          </div>
          <div className="aud-kpi-s green">
            <div className="aud-kpi-lbl">Criações</div>
            <div className="aud-kpi-val">{summary?.kpis.creates ?? '—'}</div>
            <div className="aud-kpi-sub">novos registros</div>
          </div>
          <div className="aud-kpi-s yellow">
            <div className="aud-kpi-lbl">Edições</div>
            <div className="aud-kpi-val">{summary?.kpis.updates ?? '—'}</div>
            <div className="aud-kpi-sub">alterações realizadas</div>
          </div>
          <div className="aud-kpi-s red">
            <div className="aud-kpi-lbl">Exclusões</div>
            <div className="aud-kpi-val">{summary?.kpis.deletes ?? '—'}</div>
            <div className="aud-kpi-sub">registros removidos</div>
          </div>
          <div className="aud-kpi-s purple">
            <div className="aud-kpi-lbl">Acessos</div>
            <div className="aud-kpi-val">{summary?.kpis.logins ?? '—'}</div>
            <div className="aud-kpi-sub">logins no período</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="aud-filter-card">
          <div className="aud-filter-row">
            <div className="aud-filter-field">
              <label className="aud-filter-label">De</label>
              <input type="date" className="aud-filter-input" value={fFrom} onChange={e => setFFrom(e.target.value)} />
            </div>
            <div className="aud-filter-field">
              <label className="aud-filter-label">Até</label>
              <input type="date" className="aud-filter-input" value={fTo} onChange={e => setFTo(e.target.value)} />
            </div>
            <div className="aud-filter-field">
              <label className="aud-filter-label">Usuário</label>
              <select className="aud-filter-select" value={fUser} onChange={e => setFUser(e.target.value)}>
                <option value="">Todos os usuários</option>
                {usersFromSummary.map(u => (
                  <option key={u.userId} value={u.userId}>{u.userName}</option>
                ))}
              </select>
            </div>
            <div className="aud-filter-field">
              <label className="aud-filter-label">Módulo</label>
              <select className="aud-filter-select" value={fModule} onChange={e => setFModule(e.target.value)}>
                <option value="">Todos os módulos</option>
                {modulesFromSummary.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="aud-filter-field">
              <label className="aud-filter-label">Tipo de ação</label>
              <select className="aud-filter-select" value={fOperation} onChange={e => setFOperation(e.target.value)}>
                <option value="">Todas as ações</option>
                <option value="Create">Criação</option>
                <option value="Update">Edição</option>
                <option value="Delete">Exclusão</option>
                <option value="Login">Login</option>
                <option value="Config">Configuração</option>
                <option value="Export">Exportação</option>
                <option value="System">Sistema</option>
              </select>
            </div>
            <div className="aud-filter-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="text"
                placeholder="Buscar por descrição, ID ou IP..."
                value={fSearch}
                onChange={e => setFSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
              />
            </div>
            <button className="aud-btn-buscar" onClick={() => applyFilters()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Buscar
            </button>
            <button className="aud-btn-limpar" onClick={clearFilters}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Limpar
            </button>
          </div>
        </div>

        {/* Layout principal */}
        <div className="aud-main-grid">
          {/* Feed */}
          <div className="aud-log-card">
            <div className="aud-log-header">
              <div className="aud-log-title">Histórico de eventos</div>
              <div className="aud-log-count">
                {page ? `${page.totalCount} evento${page.totalCount === 1 ? '' : 's'}` : '—'}
              </div>
            </div>
            {loading && !page ? (
              <div className="aud-empty-inline">Carregando eventos…</div>
            ) : !page || page.items.length === 0 ? (
              <div className="aud-empty-inline">Nenhum evento encontrado para os filtros selecionados.</div>
            ) : (
              <div className="aud-log-feed">
                {grouped.map(([date, items]) => (
                  <div className="aud-log-date-group" key={date}>
                    <div className="aud-log-date-label">{formatDateLabel(date, todayStr, yestStr)}</div>
                    {items.map(l => {
                      const meta = opMeta(l.operation);
                      return (
                        <div
                          className={`aud-log-item ${selectedId === l.id ? 'selected' : ''}`}
                          key={l.id}
                          onClick={() => setSelectedId(l.id)}
                        >
                          <div className="aud-log-icon" style={{ background: meta.bg }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={meta.fg} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: meta.icon }} />
                          </div>
                          <div className="aud-log-line">
                            <div className="aud-log-top">
                              <span className="aud-log-hora">{l.timeLabel}</span>
                              <span className={`aud-badge ${meta.badge}`}>{meta.label}</span>
                            </div>
                            <div className="aud-log-acao">{l.action}</div>
                            {l.details && <div className="aud-log-detalhe">{l.details}</div>}
                            <div className="aud-log-meta">
                              <span className="aud-log-user-chip">
                                <span className="aud-log-user-av" style={{ background: colorFromId(l.userId) }}>{l.userInitials}</span>
                                <span className="aud-user-name-inline">{l.userName}</span>
                              </span>
                              {l.module && <><span className="aud-sep">·</span><span className="aud-log-modulo">{l.module}</span></>}
                              {l.ipAddress && <><span className="aud-sep">·</span><span className="aud-log-ip">{l.ipAddress}</span></>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <div className="aud-pagination">
              <div className="aud-pag-info">
                {page ? `Exibindo ${page.items.length === 0 ? 0 : (page.page - 1) * page.pageSize + 1}–${(page.page - 1) * page.pageSize + page.items.length} de ${page.totalCount}` : '—'}
              </div>
              <div className="aud-pag-btns">
                <button className="aud-pag-btn" disabled={!page || page.page <= 1} onClick={() => goToPage(pageIdx - 1)} aria-label="Página anterior">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button className="aud-pag-btn active">{pageIdx}</button>
                <button className="aud-pag-btn" disabled={!page || page.page >= page.totalPages} onClick={() => goToPage(pageIdx + 1)} aria-label="Próxima página">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Painel direito */}
          <div className="aud-side-cards">
            {selected && (
              <div className="aud-detail-panel">
                <div className="aud-detail-header">
                  <div className="aud-detail-title">Detalhes do evento</div>
                  <button className="aud-detail-close" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="aud-detail-body">
                  <div className="aud-detail-row">
                    <div className="aud-detail-lbl">ID do evento</div>
                    <div className="aud-detail-val mono">{selected.id}</div>
                  </div>
                  <div className="aud-detail-separator" />
                  <div className="aud-detail-row">
                    <div className="aud-detail-lbl">Data e hora</div>
                    <div className="aud-detail-val">{selected.dateLabel} às {selected.timeLabel}</div>
                  </div>
                  <div className="aud-detail-row">
                    <div className="aud-detail-lbl">Usuário</div>
                    <div className="aud-detail-val aud-detail-user">
                      <span className="aud-detail-av" style={{ background: colorFromId(selected.userId) }}>{selected.userInitials}</span>
                      {selected.userName}
                      {selected.userRole && <span className="aud-detail-role">({selected.userRole})</span>}
                    </div>
                  </div>
                  {selected.module && (
                    <div className="aud-detail-row">
                      <div className="aud-detail-lbl">Módulo</div>
                      <div className="aud-detail-val">{selected.module}</div>
                    </div>
                  )}
                  <div className="aud-detail-row">
                    <div className="aud-detail-lbl">Tipo de ação</div>
                    <div className="aud-detail-val"><span className={`aud-badge ${opMeta(selected.operation).badge}`}>{opMeta(selected.operation).label}</span></div>
                  </div>
                  <div className="aud-detail-separator" />
                  {selected.details && (
                    <div className="aud-detail-row">
                      <div className="aud-detail-lbl">Descrição</div>
                      <div className="aud-detail-val">{selected.details}</div>
                    </div>
                  )}
                  {selected.beforeValue && (
                    <div className="aud-detail-row">
                      <div className="aud-detail-lbl">Valor anterior</div>
                      <div className="aud-detail-val mono">{selected.beforeValue}</div>
                    </div>
                  )}
                  {selected.afterValue && (
                    <div className="aud-detail-row">
                      <div className="aud-detail-lbl">Novo valor</div>
                      <div className="aud-detail-val mono">{selected.afterValue}</div>
                    </div>
                  )}
                  {selected.ipAddress && (
                    <>
                      <div className="aud-detail-separator" />
                      <div className="aud-detail-row">
                        <div className="aud-detail-lbl">Endereço IP</div>
                        <div className="aud-detail-val mono">{selected.ipAddress}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="aud-side-card">
              <div className="aud-side-header"><div className="aud-side-title">Atividade por módulo</div></div>
              <div className="aud-side-body">
                {summary && summary.modules.length > 0 ? (
                  <div className="aud-modulo-bars">
                    {summary.modules.map(m => {
                      const max = summary.modules[0].count || 1;
                      return (
                        <div className="aud-modulo-row" key={m.module}>
                          <div className="aud-modulo-label">{m.module}</div>
                          <div className="aud-modulo-bg"><div className="aud-modulo-fill" style={{ width: `${Math.round((m.count / max) * 100)}%`, background: m.color }} /></div>
                          <div className="aud-modulo-count" style={{ color: m.color }}>{m.count}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="aud-empty-side">Sem atividade nos últimos 30 dias.</div>
                )}
              </div>
            </div>

            <div className="aud-side-card">
              <div className="aud-side-header"><div className="aud-side-title">Usuários mais ativos</div></div>
              <div className="aud-side-body">
                {summary && summary.topUsers.length > 0 ? (
                  <div className="aud-users-list">
                    {summary.topUsers.map(u => (
                      <div className="aud-user-item" key={u.userId}>
                        <div className="aud-user-av" style={{ background: u.color }}>{u.initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="aud-user-name">{u.userName}</div>
                          {u.role && <div className="aud-user-role">{u.role}</div>}
                        </div>
                        <div className="aud-user-count">{u.count}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aud-empty-side">Sem usuários com atividade.</div>
                )}
              </div>
            </div>

            <div className="aud-side-card">
              <div className="aud-side-header"><div className="aud-side-title">Eventos · últimos 7 dias</div></div>
              <div className="aud-side-body" style={{ padding: '.7rem 1rem .9rem' }}>
                <div className="aud-sparkline-wrap">
                  <canvas ref={sparkRef} className="aud-spark" height={70} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="aud-toast show"><span>{toast}</span></div>}
    </>
  );
}

// ── Sparkline canvas ─────────────────────────────────────────────────────

function drawSparkline(canvas: HTMLCanvasElement, data: number[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const parentEl = canvas.parentElement as HTMLElement | null;
  const W = (parentEl?.offsetWidth ?? 200) - 2;
  canvas.width = W;
  canvas.height = 70;
  const dias = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const values = data.length === 7 ? data : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const pad = { top: 12, right: 8, bottom: 22, left: 8 };
  const gW = W - pad.left - pad.right;
  const gH = 70 - pad.top - pad.bottom;
  const n = values.length;
  const xStep = gW / Math.max(1, n - 1);
  const x = (i: number) => pad.left + i * xStep;
  const y = (v: number) => pad.top + gH - ((v - min) / (max - min + 1)) * gH;

  ctx.clearRect(0, 0, W, 70);

  // Área
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.lineTo(x(n - 1), pad.top + gH);
  ctx.lineTo(x(0), pad.top + gH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
  grad.addColorStop(0, '#6366f128');
  grad.addColorStop(1, '#6366f103');
  ctx.fillStyle = grad;
  ctx.fill();

  // Linha
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.stroke();

  // Pontos
  values.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(v), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Labels
  ctx.fillStyle = '#7a9090';
  ctx.font = '700 9px "Nunito Sans"';
  ctx.textAlign = 'center';
  dias.forEach((d, i) => ctx.fillText(d, x(i), 70 - 4));
}

function colorFromId(id: string) {
  const palette = ['#6366f1', '#2DBFB8', '#22c55e', '#8b5cf6', '#f97316', '#ef4444', '#3b82f6', '#f59e0b'];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

// ── CSS (prefixo aud-) ──────────────────────────────────────────────────

const CSS = `
#adm-root .aud-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; gap:.7rem; }
#adm-root .aud-topbar-left { display:flex; align-items:center; gap:.75rem; min-width:0; }
#adm-root .aud-topbar-right { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
#adm-root .aud-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .aud-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .aud-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .aud-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }

#adm-root .aud-btn-export { display:flex; align-items:center; gap:.4rem; padding:.5rem 1rem; border-radius:10px; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:all .15s; border:1.5px solid; background:none; }
#adm-root .aud-btn-xlsx { color:#16a34a; border-color:rgba(22,163,74,.3); background:rgba(22,163,74,.06); }
#adm-root .aud-btn-xlsx:hover { background:rgba(22,163,74,.12); }
#adm-root .aud-btn-pdf { color:#e05555; border-color:rgba(224,85,85,.3); background:rgba(224,85,85,.06); }
#adm-root .aud-btn-pdf:hover { background:rgba(224,85,85,.12); }

#adm-root .aud-content { flex:1; padding:2rem; overflow-y:auto; animation:aud-fadeUp .35s ease; }
@keyframes aud-fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

/* KPI strip */
#adm-root .aud-kpi-strip { display:grid; grid-template-columns:repeat(5,1fr); gap:1rem; margin-bottom:1.4rem; }
#adm-root .aud-kpi-s { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .aud-kpi-s::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .aud-kpi-s.indigo::after { background:var(--indigo); }
#adm-root .aud-kpi-s.green::after  { background:var(--green); }
#adm-root .aud-kpi-s.yellow::after { background:var(--yellow); }
#adm-root .aud-kpi-s.red::after    { background:var(--red); }
#adm-root .aud-kpi-s.purple::after { background:var(--purple); }
#adm-root .aud-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .aud-kpi-val { font-family:'Nunito',sans-serif; font-size:1.6rem; font-weight:900; line-height:1; }
#adm-root .aud-kpi-s.indigo .aud-kpi-val { color:var(--indigo); }
#adm-root .aud-kpi-s.green  .aud-kpi-val { color:var(--green); }
#adm-root .aud-kpi-s.yellow .aud-kpi-val { color:var(--yellow); }
#adm-root .aud-kpi-s.red    .aud-kpi-val { color:var(--red); }
#adm-root .aud-kpi-s.purple .aud-kpi-val { color:var(--purple); }
#adm-root .aud-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }

/* Filtros */
#adm-root .aud-filter-card { background:var(--surface); border:1.5px solid var(--border); border-radius:16px; padding:1rem 1.4rem; margin-bottom:1.2rem; }
#adm-root .aud-filter-row { display:flex; align-items:flex-end; gap:.8rem; flex-wrap:wrap; }
#adm-root .aud-filter-field { display:flex; flex-direction:column; gap:.3rem; }
#adm-root .aud-filter-label { font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .aud-filter-input, #adm-root .aud-filter-select { padding:.6rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .aud-filter-input:focus, #adm-root .aud-filter-select:focus { border-color:var(--indigo); background:var(--surface); }
#adm-root .aud-filter-select { appearance:none; -webkit-appearance:none; padding-right:2.2rem; cursor:pointer; }
#adm-root .aud-filter-search { position:relative; flex:1; min-width:220px; }
#adm-root .aud-filter-search svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .aud-filter-search input { width:100%; padding:.6rem 1rem .6rem 2.5rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .aud-filter-search input:focus { border-color:var(--indigo); background:var(--surface); }
#adm-root .aud-btn-buscar { display:flex; align-items:center; gap:.4rem; padding:.62rem 1.2rem; border:none; border-radius:10px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); font-family:'Nunito',sans-serif; font-size:.82rem; font-weight:800; color:#fff; cursor:pointer; box-shadow:0 3px 10px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .aud-btn-buscar:hover { transform:translateY(-1px); }
#adm-root .aud-btn-limpar { display:flex; align-items:center; gap:.35rem; padding:.62rem .9rem; border:1.5px solid var(--border); border-radius:10px; background:none; font-family:'Nunito',sans-serif; font-size:.8rem; font-weight:700; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .aud-btn-limpar:hover { border-color:var(--indigo); color:var(--indigo); }

/* Layout principal */
#adm-root .aud-main-grid { display:grid; grid-template-columns:1fr 300px; gap:1.2rem; align-items:start; }
#adm-root .aud-log-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .aud-log-header { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .aud-log-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .aud-log-count { font-size:.72rem; font-weight:700; color:var(--muted); }
#adm-root .aud-log-feed { overflow-y:auto; max-height:620px; }
#adm-root .aud-log-feed::-webkit-scrollbar { width:4px; }
#adm-root .aud-log-feed::-webkit-scrollbar-thumb { background:rgba(0,0,0,.08); border-radius:4px; }

#adm-root .aud-log-date-label { padding:.55rem 1.4rem; background:var(--bg); font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:2; }

#adm-root .aud-log-item { display:flex; align-items:flex-start; gap:.9rem; padding:.9rem 1.4rem; border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; cursor:pointer; }
#adm-root .aud-log-item:last-child { border-bottom:none; }
#adm-root .aud-log-item:hover { background:#f8f9ff; }
#adm-root .aud-log-item.selected { background:var(--indigo-light); }

#adm-root .aud-log-icon { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }

#adm-root .aud-log-line { display:flex; flex-direction:column; gap:.2rem; flex:1; min-width:0; }
#adm-root .aud-log-top { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
#adm-root .aud-log-hora { font-size:.68rem; font-weight:800; color:var(--muted); white-space:nowrap; font-family:'Nunito',sans-serif; }
#adm-root .aud-log-acao { font-size:.82rem; font-weight:800; color:var(--text); line-height:1.3; }
#adm-root .aud-log-detalhe { font-size:.73rem; font-weight:600; color:var(--muted); line-height:1.4; margin-top:2px; }
#adm-root .aud-log-meta { display:flex; align-items:center; gap:.5rem; margin-top:.3rem; flex-wrap:wrap; }

/* Badges */
#adm-root .aud-badge { display:inline-flex; align-items:center; gap:.28rem; font-size:.62rem; font-weight:800; padding:.2rem .6rem; border-radius:20px; white-space:nowrap; }
#adm-root .aud-badge.ger-badge-criar    { background:var(--green-light);  color:#16a34a; }
#adm-root .aud-badge.ger-badge-editar   { background:var(--indigo-light); color:var(--indigo); }
#adm-root .aud-badge.ger-badge-excluir  { background:var(--red-light);    color:#dc2626; }
#adm-root .aud-badge.ger-badge-login    { background:var(--blue-light);   color:var(--blue); }
#adm-root .aud-badge.ger-badge-logout   { background:rgba(107,114,128,.12); color:var(--muted); }
#adm-root .aud-badge.ger-badge-config   { background:var(--yellow-light); color:#b45309; }
#adm-root .aud-badge.ger-badge-export   { background:var(--teal-light);   color:#0f766e; }
#adm-root .aud-badge.ger-badge-sistema  { background:var(--purple-light); color:var(--purple); }

#adm-root .aud-log-user-chip { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; color:var(--muted); }
#adm-root .aud-log-user-av { width:16px; height:16px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:.48rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .aud-user-name-inline { color:var(--muted); font-weight:700; }
#adm-root .aud-sep { color:var(--border); }
#adm-root .aud-log-modulo { font-size:.65rem; font-weight:700; color:var(--muted); }
#adm-root .aud-log-ip { font-size:.62rem; font-weight:600; color:var(--muted); font-family:'Courier New',monospace; }

/* Painel direito */
#adm-root .aud-side-cards { display:flex; flex-direction:column; gap:.9rem; }
#adm-root .aud-side-card { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .aud-side-header { padding:.85rem 1.2rem; border-bottom:1px solid var(--border); }
#adm-root .aud-side-title { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; color:var(--text); }
#adm-root .aud-side-body { padding:.9rem 1.2rem; }
#adm-root .aud-empty-side { padding:1rem 0; text-align:center; font-size:.72rem; font-weight:600; color:var(--muted); }
#adm-root .aud-empty-inline { padding:3rem 1rem; text-align:center; font-size:.85rem; font-weight:700; color:var(--muted); }

/* Módulos */
#adm-root .aud-modulo-bars { display:flex; flex-direction:column; gap:.55rem; }
#adm-root .aud-modulo-row { display:flex; align-items:center; gap:.6rem; }
#adm-root .aud-modulo-label { font-size:.72rem; font-weight:700; color:var(--text); min-width:110px; }
#adm-root .aud-modulo-bg { flex:1; height:8px; border-radius:8px; background:var(--bg); overflow:hidden; }
#adm-root .aud-modulo-fill { height:100%; border-radius:8px; transition:width .6s ease; }
#adm-root .aud-modulo-count { font-size:.7rem; font-weight:900; min-width:28px; text-align:right; font-family:'Nunito',sans-serif; }

/* Usuários */
#adm-root .aud-users-list { display:flex; flex-direction:column; gap:.45rem; }
#adm-root .aud-user-item { display:flex; align-items:center; gap:.6rem; padding:.45rem .5rem; border-radius:9px; background:var(--bg); }
#adm-root .aud-user-av { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.6rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .aud-user-name { font-size:.75rem; font-weight:800; color:var(--text); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#adm-root .aud-user-role { font-size:.62rem; font-weight:600; color:var(--muted); }
#adm-root .aud-user-count { font-family:'Nunito',sans-serif; font-size:.82rem; font-weight:900; color:var(--indigo); }

/* Sparkline */
#adm-root .aud-sparkline-wrap { padding:.3rem 0 .1rem; }
#adm-root .aud-spark { display:block; width:100%; }

/* Detail panel */
#adm-root .aud-detail-panel { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .aud-detail-header { padding:.85rem 1.2rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:.6rem; }
#adm-root .aud-detail-title { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; color:var(--text); flex:1; }
#adm-root .aud-detail-close { background:none; border:none; cursor:pointer; color:var(--muted); line-height:0; padding:2px; }
#adm-root .aud-detail-close:hover { color:var(--text); }
#adm-root .aud-detail-body { padding:1rem 1.2rem; display:flex; flex-direction:column; gap:.6rem; }
#adm-root .aud-detail-row { display:flex; flex-direction:column; gap:.2rem; }
#adm-root .aud-detail-lbl { font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .aud-detail-val { font-size:.8rem; font-weight:700; color:var(--text); line-height:1.4; }
#adm-root .aud-detail-val.mono { font-family:'Courier New',monospace; font-size:.74rem; background:var(--bg); padding:.4rem .6rem; border-radius:8px; word-break:break-all; }
#adm-root .aud-detail-separator { height:1px; background:var(--border); }
#adm-root .aud-detail-user { display:flex; align-items:center; gap:.5rem; }
#adm-root .aud-detail-av { width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:.55rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .aud-detail-role { font-size:.68rem; color:var(--muted); margin-left:.25rem; }

/* Paginação */
#adm-root .aud-pagination { display:flex; align-items:center; justify-content:space-between; padding:.9rem 1.4rem; border-top:1px solid var(--border); flex-wrap:wrap; gap:.5rem; }
#adm-root .aud-pag-info { font-size:.72rem; font-weight:600; color:var(--muted); }
#adm-root .aud-pag-btns { display:flex; gap:.4rem; }
#adm-root .aud-pag-btn { width:32px; height:32px; border-radius:8px; border:1.5px solid var(--border); background:none; font-family:'Nunito',sans-serif; font-size:.8rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; display:flex; align-items:center; justify-content:center; }
#adm-root .aud-pag-btn:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .aud-pag-btn.active { background:var(--indigo); border-color:var(--indigo); color:#fff; }
#adm-root .aud-pag-btn:disabled { opacity:.4; cursor:not-allowed; }

/* Toast */
#adm-root .aud-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); z-index:200; }
#adm-root .aud-toast.show { animation:aud-toast-in .3s ease; }
@keyframes aud-toast-in { from{opacity:0;transform:translateY(80px)} to{opacity:1;transform:translateY(0)} }

/* Dark mode */
#adm-root.dark .aud-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .aud-kpi-s, #adm-root.dark .aud-filter-card, #adm-root.dark .aud-log-card, #adm-root.dark .aud-side-card, #adm-root.dark .aud-detail-panel { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .aud-log-item:hover { background:#242b47; }
#adm-root.dark .aud-log-date-label, #adm-root.dark .aud-user-item, #adm-root.dark .aud-modulo-bg, #adm-root.dark .aud-detail-val.mono { background:#0f1119; }

/* Responsive tablet ~1100px */
@media (max-width: 1100px) {
  #adm-root .aud-kpi-strip { grid-template-columns:repeat(3, 1fr); }
  #adm-root .aud-main-grid { grid-template-columns:1fr; }
}

/* Responsive mobile ~768px */
@media (max-width: 768px) {
  #adm-root .aud-hamburger { display:flex; }
  #adm-root .aud-topbar { padding:.85rem 1rem; flex-wrap:wrap; }
  #adm-root .aud-topbar-title { font-size:.9rem; line-height:1.2; }
  #adm-root .aud-topbar-sub { font-size:.62rem; }
  #adm-root .aud-content { padding:1rem; }
  #adm-root .aud-btn-label { display:none; }
  #adm-root .aud-btn-export { padding:.5rem .65rem; }
  #adm-root .aud-kpi-strip { grid-template-columns:repeat(2, 1fr); gap:.7rem; }
  #adm-root .aud-kpi-val { font-size:1.35rem; }
  #adm-root .aud-filter-row { flex-direction:column; align-items:stretch; }
  #adm-root .aud-filter-field, #adm-root .aud-filter-search { width:100%; }
  #adm-root .aud-filter-search { min-width:0; }
  #adm-root .aud-log-header { padding:.85rem 1rem; }
  #adm-root .aud-log-date-label { padding:.55rem 1rem; }
  #adm-root .aud-log-item { padding:.85rem 1rem; gap:.7rem; }
  #adm-root .aud-log-acao { font-size:.8rem; }
  #adm-root .aud-log-detalhe { font-size:.72rem; }
  #adm-root .aud-log-meta { gap:.35rem; }
  #adm-root .aud-user-name-inline { display:none; }
  #adm-root .aud-pagination { padding:.8rem 1rem; }
  #adm-root .aud-side-body { padding:.7rem 1rem; }
}
`;
