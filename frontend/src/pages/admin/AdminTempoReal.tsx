/**
 * Admin OS — Tempo Real.
 * Painel ao vivo de presença por UPA/turno, cruzando escalas de hoje com
 * check-ins reais. Replica o mock em /originais/OS/admin-tempo-real.html,
 * mas com dados reais vindos de GET /api/attendance/live-status.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { attendanceApi } from '../../api/attendanceApi';
import type { LiveClinic, LiveStatusResponse } from '../../api/attendanceApi';
import { formatHmBR, formatHmsBR, formatLongDateBR } from '../../utils/dateTimeBR';

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

const ThemeIconMoon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
);
const ThemeIconSun = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);

function statusToPt(status: string): 'ok' | 'warn' | 'critico' {
  if (status === 'Critico') return 'critico';
  if (status === 'Atencao') return 'warn';
  return 'ok';
}

function profStatusMeta(status: string): { cls: string; icon: string } {
  switch (status) {
    case 'Presente': return { cls: 'presente', icon: '✓' };
    case 'Atrasado': return { cls: 'atrasado', icon: '⏱' };
    case 'Ausente': return { cls: 'ausente', icon: '✗' };
    default: return { cls: 'escalado', icon: '📅' };
  }
}

function formatHm(iso: string | null): string {
  if (!iso) return '—';
  return formatHmBR(iso);
}

function fmtTimeSpan(t: string): string {
  // "07:00:00" -> "07h"
  const [h] = t.split(':');
  return `${h}h`;
}

const AVATAR_COLORS = ['#6366f1', '#2DBFB8', '#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444', '#0f766e', '#7c3aed', '#be185d', '#b45309'];

export function AdminTempoReal({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const [data, setData] = useState<LiveStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterContrato, setFilterContrato] = useState<string>('todos');
  const [clock, setClock] = useState(new Date());
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await attendanceApi.getLiveStatus();
      setData(result);
    } catch {
      // graceful — mantém tela com o que já tinha carregado
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    showToast('✅ Dados atualizados com sucesso!');
  }

  const clinics = data?.clinics ?? [];

  // Agrupa contratos disponíveis para os tabs
  const contratos = useMemo(() => {
    const map = new Map<string, { id: string; label: string; sub: string; count: number }>();
    for (const c of clinics) {
      const key = c.contractId ?? 'sem-contrato';
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, {
          id: key,
          label: c.publicOrganName ?? 'Sem contrato',
          sub: c.contractNumber ? `${c.contractNumber}` : '—',
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [clinics]);

  const filteredClinics = useMemo(() => {
    if (filterContrato === 'todos') return clinics;
    return clinics.filter(c => (c.contractId ?? 'sem-contrato') === filterContrato);
  }, [clinics, filterContrato]);

  const dateStr = formatLongDateBR(clock);
  const timeStr = formatHmsBR(clock);

  const overallStatus = useMemo(() => {
    if (clinics.some(c => c.status === 'Critico')) return { emoji: '⚠', label: 'Atenção requerida' };
    if (clinics.some(c => c.status === 'Atencao')) return { emoji: '🟡', label: 'Monitorar' };
    return { emoji: '✅', label: 'Tudo normal' };
  }, [clinics]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TEMPO_REAL_CSS }} />

      <div className="tr-topbar">
        <div className="tr-topbar-left">
          <button className="tr-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div>
            <div className="tr-topbar-title">Tempo Real — Todos os Contratos</div>
            <div className="tr-topbar-sub">{dateStr}</div>
          </div>
        </div>
        <div className="tr-topbar-right">
          <div className="tr-relogio">{timeStr}</div>
          <div className="tr-live-badge"><div className="tr-live-dot" />Ao vivo</div>
          <button className="tr-btn-atualizar" onClick={handleRefresh} disabled={refreshing}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'tr-spin' : ''}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-.49-4.5" /></svg>
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>
            {dark ? ThemeIconMoon : ThemeIconSun}
          </button>
        </div>
      </div>

      <div className="tr-content">
        {loading ? (
          <div className="tr-loading">Carregando painel…</div>
        ) : (
          <>
            {/* RESUMO GLOBAL */}
            <div className="tr-resumo-global">
              <div className="tr-rg-titulo">
                <div className="tr-rg-titulo-label">Status global agora</div>
                <div className="tr-rg-titulo-val">{overallStatus.emoji} {overallStatus.label}</div>
                <div className="tr-rg-titulo-sub">{contratos.length} contrato{contratos.length !== 1 ? 's' : ''} · {clinics.length} UPA{clinics.length !== 1 ? 's' : ''} em operação</div>
              </div>
              <div className="tr-rg-stats">
                <div className="tr-rg-stat">
                  <div className="tr-rg-stat-val ok">{data?.totalPresent ?? 0}</div>
                  <div className="tr-rg-stat-lbl">Presentes</div>
                </div>
                <div className="tr-rg-stat">
                  <div className="tr-rg-stat-val warn">{data?.totalLate ?? 0}</div>
                  <div className="tr-rg-stat-lbl">Atrasados</div>
                </div>
                <div className="tr-rg-stat">
                  <div className="tr-rg-stat-val crit">{data?.totalAbsent ?? 0}</div>
                  <div className="tr-rg-stat-lbl">Ausentes</div>
                </div>
                <div className="tr-rg-stat">
                  <div className="tr-rg-stat-val crit">{data?.totalOpenSlots ?? 0}</div>
                  <div className="tr-rg-stat-lbl">Vagas abertas</div>
                </div>
                <div className="tr-rg-stat">
                  <div className="tr-rg-stat-val" style={{ color: '#a5b4fc' }}>{data?.overallSlaPercent ?? 100}%</div>
                  <div className="tr-rg-stat-lbl">SLA hoje</div>
                </div>
              </div>
            </div>

            {/* TABS DE CONTRATO */}
            {contratos.length > 0 && (
              <div className="tr-contrato-tabs">
                <div className={`tr-contrato-tab ${filterContrato === 'todos' ? 'active' : ''}`} onClick={() => setFilterContrato('todos')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                  <div className="tr-contrato-tab-nome">Todas as UPAs</div>
                  <div className="tr-contrato-tab-count">{clinics.length} unidade{clinics.length !== 1 ? 's' : ''}</div>
                </div>
                {contratos.map(c => (
                  <div key={c.id} className={`tr-contrato-tab ${filterContrato === c.id ? 'active' : ''}`} onClick={() => setFilterContrato(c.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    <div className="tr-contrato-tab-nome">{c.label}</div>
                    <div className="tr-contrato-tab-count">{c.sub} · {c.count} UPA{c.count !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            )}

            {/* GRID DE UPAs */}
            {filteredClinics.length === 0 ? (
              <div className="tr-empty">Nenhuma UPA com plantões hoje.</div>
            ) : (
              <div className="tr-upas-grid">
                {filteredClinics.map(clinic => (
                  <ClinicCard key={clinic.clinicId} clinic={clinic} onAction={showToast} />
                ))}
              </div>
            )}

            {/* EVENTOS RECENTES */}
            <div className="tr-eventos-card">
              <div className="tr-eventos-header">
                <div className="tr-eventos-title">Feed de eventos — hoje</div>
                <span className="tr-eventos-hint">Atualiza automaticamente</span>
              </div>
              <div className="tr-eventos-list">
                {(data?.recentEvents ?? []).length === 0 ? (
                  <div className="tr-eventos-empty">Nenhum evento registrado ainda hoje.</div>
                ) : (
                  data!.recentEvents.map((e, i) => (
                    <div className="tr-evento-item" key={i}>
                      <div className="tr-evento-hora">{formatHm(e.time)}</div>
                      <div className={`tr-evento-icon ${e.type}`}>{e.type === 'critico' ? '🔴' : e.type === 'warn' ? '🟡' : '🟢'}</div>
                      <div className="tr-evento-texto">{e.description}</div>
                      <div className="tr-evento-upa">{e.clinicName}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`tr-toast ${toast ? 'show' : ''}`}><span>{toast}</span></div>
    </>
  );
}

function ClinicCard({ clinic, onAction }: { clinic: LiveClinic; onAction: (msg: string) => void }) {
  const status = statusToPt(clinic.status);
  const temAlerta = status === 'critico' || status === 'warn';

  return (
    <div className={`tr-upa-card ${status}`}>
      <div className="tr-upa-header">
        <div className="tr-upa-header-left">
          <div className={`tr-upa-semaforo ${status}`} />
          <div>
            <div className="tr-upa-nome">{clinic.clinicName}</div>
            <div className="tr-upa-contrato">{clinic.publicOrganName ?? 'Sem contrato'}{clinic.contractNumber ? ` · ${clinic.contractNumber}` : ''}</div>
          </div>
        </div>
        <span className={`tr-upa-status-badge ${status}`}>
          {status === 'critico' ? 'Atenção crítica' : status === 'warn' ? 'Atenção' : 'Normal'}
        </span>
      </div>

      <div className="tr-upa-turnos">
        {clinic.shifts.length === 0 && (
          <div className="tr-turno-vazio">Nenhum plantão programado hoje.</div>
        )}
        {clinic.shifts.map(shift => (
          <div className="tr-turno-row" key={shift.shiftId} style={!shift.isActive ? { opacity: .65 } : undefined}>
            <div className="tr-turno-label">{shift.title}</div>
            <div className="tr-turno-horario">{fmtTimeSpan(shift.startTime)}–{fmtTimeSpan(shift.endTime)}</div>
            <div className="tr-turno-medicos">
              {shift.professionals.map(p => {
                const meta = profStatusMeta(p.status);
                const iniciais = p.userName.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
                const color = AVATAR_COLORS[Math.abs(hashCode(p.userId)) % AVATAR_COLORS.length];
                return (
                  <div className={`tr-med-chip ${meta.cls}`} key={p.userId} title={`${p.userName}${p.checkInTime ? ' · ' + formatHm(p.checkInTime) : ''}`}>
                    <div className="tr-med-av" style={{ background: color }}>{iniciais}</div>
                    <span>{p.userName.split(' ').slice(0, 2).join(' ')}</span>
                  </div>
                );
              })}
              {shift.professionals.length === 0 && shift.openSlots === 0 && (
                <span className="tr-turno-sem-escala">Sem escala</span>
              )}
            </div>
            {shift.openSlots > 0 && (
              <span className="tr-turno-vagas crit">{shift.openSlots} vaga{shift.openSlots > 1 ? 's' : ''} aberta{shift.openSlots > 1 ? 's' : ''}</span>
            )}
            {shift.openSlots === 0 && shift.professionals.length > 0 && (
              <span className="tr-turno-vagas ok">Completo</span>
            )}
            {!shift.isActive && <span className="tr-turno-futuro">Próximo turno</span>}
          </div>
        ))}
      </div>

      <div className="tr-upa-stats">
        <div className="tr-upa-stat"><div className="tr-upa-stat-val" style={{ color: 'var(--green)' }}>{clinic.presentCount}</div><div className="tr-upa-stat-lbl">Presentes</div></div>
        <div className="tr-upa-stat"><div className="tr-upa-stat-val" style={{ color: clinic.lateCount > 0 ? 'var(--yellow)' : 'var(--muted)' }}>{clinic.lateCount}</div><div className="tr-upa-stat-lbl">Atrasados</div></div>
        <div className="tr-upa-stat"><div className="tr-upa-stat-val" style={{ color: clinic.absentCount > 0 ? 'var(--red)' : 'var(--muted)' }}>{clinic.absentCount}</div><div className="tr-upa-stat-lbl">Ausentes</div></div>
        <div className="tr-upa-stat"><div className="tr-upa-stat-val" style={{ color: clinic.slaPercent === 100 ? 'var(--green)' : clinic.slaPercent >= 85 ? 'var(--yellow)' : 'var(--red)' }}>{clinic.slaPercent}%</div><div className="tr-upa-stat-lbl">SLA hoje</div></div>
      </div>

      <div className="tr-upa-footer">
        <div className="tr-upa-footer-info">{clinic.lastEventDescription ? `Último evento: ${clinic.lastEventDescription}` : 'Sem eventos registrados hoje'}</div>
        <div className="tr-upa-footer-actions">
          {temAlerta && (
            <button className="tr-btn-upa alerta" onClick={() => onAction(`Abrindo Central de Alertas para ${clinic.clinicName}`)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              Alerta
            </button>
          )}
          <button className="tr-btn-upa" onClick={() => onAction(`Abrindo histórico de ${clinic.clinicName}`)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            Detalhes
          </button>
        </div>
      </div>
    </div>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}

/* ═══════════════════════════════════════════════════════════════════
   CSS — segue o padrão visual do mock admin-tempo-real.html,
   adaptado às CSS vars já definidas em #adm-root (AdminPage).
   Scoped com prefixo tr- para não colidir com outras telas.
   ═══════════════════════════════════════════════════════════════════ */
const TEMPO_REAL_CSS = `
#adm-root .tr-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:40; flex-wrap:wrap; gap:.6rem; }
#adm-root .tr-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .tr-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .tr-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .tr-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .tr-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }
#adm-root .tr-topbar-right { display:flex; align-items:center; gap:.7rem; flex-wrap:wrap; }
#adm-root .tr-relogio { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--indigo); background:var(--indigo-light); padding:.35rem .9rem; border-radius:10px; letter-spacing:.03em; }
#adm-root .tr-live-badge { display:flex; align-items:center; gap:.4rem; font-size:.72rem; font-weight:800; color:var(--green); background:var(--green-light); border:1px solid rgba(34,197,94,.2); border-radius:20px; padding:.3rem .8rem; }
#adm-root .tr-live-dot { width:7px; height:7px; border-radius:50%; background:var(--green); animation:tr-pulse-g 1.4s ease infinite; }
@keyframes tr-pulse-g { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
#adm-root .tr-btn-atualizar { display:flex; align-items:center; gap:.4rem; padding:.45rem .9rem; border:1.5px solid var(--border); border-radius:10px; background:none; font-family:'Nunito',sans-serif; font-size:.75rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .tr-btn-atualizar:hover:not(:disabled) { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .tr-btn-atualizar:disabled { opacity:.6; cursor:default; }
#adm-root .tr-spin { animation:tr-spin 1s linear infinite; }
@keyframes tr-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }

#adm-root .tr-content { flex:1; padding:2rem; overflow-y:auto; animation:tr-fadeUp .35s ease; }
@keyframes tr-fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
#adm-root .tr-loading { text-align:center; padding:3rem; color:var(--muted); font-weight:700; font-size:.9rem; }
#adm-root .tr-empty { text-align:center; padding:2rem; color:var(--muted); font-weight:700; font-size:.85rem; background:var(--surface); border-radius:16px; border:1.5px dashed var(--border); margin-bottom:1.4rem; }

/* RESUMO GLOBAL */
#adm-root .tr-resumo-global { background:linear-gradient(135deg,#1a1f36 0%,#2d3561 55%,#3d4a8a 100%); border-radius:20px; padding:1.4rem 2rem; display:flex; align-items:center; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; margin-bottom:1.4rem; position:relative; overflow:hidden; }
#adm-root .tr-resumo-global::before { content:''; position:absolute; width:280px; height:280px; border-radius:50%; border:40px solid rgba(255,255,255,.04); right:-90px; top:-100px; }
#adm-root .tr-rg-titulo { position:relative; z-index:1; }
#adm-root .tr-rg-titulo-label { font-size:.68rem; font-weight:700; color:rgba(255,255,255,.6); text-transform:uppercase; letter-spacing:.06em; margin-bottom:.3rem; }
#adm-root .tr-rg-titulo-val { font-family:'Nunito',sans-serif; font-size:1.8rem; font-weight:900; color:#fff; line-height:1; }
#adm-root .tr-rg-titulo-sub { font-size:.75rem; font-weight:600; color:rgba(255,255,255,.65); margin-top:.3rem; }
#adm-root .tr-rg-stats { display:flex; gap:1.2rem; flex-wrap:wrap; position:relative; z-index:1; }
#adm-root .tr-rg-stat { background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:14px; padding:.75rem 1.1rem; text-align:center; min-width:90px; }
#adm-root .tr-rg-stat-val { font-family:'Nunito',sans-serif; font-size:1.5rem; font-weight:900; color:#fff; line-height:1; }
#adm-root .tr-rg-stat-val.ok { color:#4ade80; }
#adm-root .tr-rg-stat-val.warn { color:#fbbf24; }
#adm-root .tr-rg-stat-val.crit { color:#f87171; }
#adm-root .tr-rg-stat-lbl { font-size:.62rem; font-weight:700; color:rgba(255,255,255,.6); margin-top:.25rem; text-transform:uppercase; letter-spacing:.05em; }

/* TABS DE CONTRATO */
#adm-root .tr-contrato-tabs { display:flex; gap:.6rem; margin-bottom:1.4rem; flex-wrap:wrap; }
#adm-root .tr-contrato-tab { display:flex; align-items:center; gap:.5rem; padding:.55rem 1.1rem; border-radius:12px; border:1.5px solid var(--border); background:var(--surface); cursor:pointer; transition:all .15s; }
#adm-root .tr-contrato-tab:hover { border-color:var(--indigo); background:var(--indigo-light); }
#adm-root .tr-contrato-tab.active { border-color:var(--indigo); background:var(--indigo-light); }
#adm-root .tr-contrato-tab-nome { font-family:'Nunito',sans-serif; font-size:.82rem; font-weight:900; color:var(--text); }
#adm-root .tr-contrato-tab.active .tr-contrato-tab-nome { color:var(--indigo); }
#adm-root .tr-contrato-tab-count { font-size:.65rem; font-weight:800; background:var(--bg); padding:.15rem .5rem; border-radius:8px; color:var(--muted); }
#adm-root .tr-contrato-tab.active .tr-contrato-tab-count { background:rgba(99,102,241,.15); color:var(--indigo); }

/* GRID DE UPAs */
#adm-root .tr-upas-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:1.2rem; margin-bottom:1.4rem; }
#adm-root .tr-upa-card { background:var(--surface); border-radius:20px; border:1.5px solid var(--border); overflow:hidden; transition:transform .15s,box-shadow .15s; }
#adm-root .tr-upa-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.08); }
#adm-root .tr-upa-card.ok { border-top:4px solid var(--green); }
#adm-root .tr-upa-card.warn { border-top:4px solid var(--yellow); }
#adm-root .tr-upa-card.critico { border-top:4px solid var(--red); }

#adm-root .tr-upa-header { padding:1rem 1.4rem; display:flex; align-items:flex-start; justify-content:space-between; gap:.8rem; border-bottom:1px solid var(--border); }
#adm-root .tr-upa-header-left { display:flex; align-items:center; gap:.8rem; }
#adm-root .tr-upa-semaforo { width:14px; height:14px; border-radius:50%; flex-shrink:0; box-shadow:0 0 0 3px currentColor; animation:tr-pulse-sem 2s ease infinite; }
#adm-root .tr-upa-semaforo.ok { background:var(--green); color:rgba(34,197,94,.25); }
#adm-root .tr-upa-semaforo.warn { background:var(--yellow); color:rgba(245,158,11,.25); }
#adm-root .tr-upa-semaforo.critico { background:var(--red); color:rgba(239,68,68,.25); }
@keyframes tr-pulse-sem { 0%,100%{box-shadow:0 0 0 3px currentColor} 50%{box-shadow:0 0 0 6px transparent} }
#adm-root .tr-upa-nome { font-family:'Nunito',sans-serif; font-size:1rem; font-weight:900; color:var(--text); line-height:1.2; }
#adm-root .tr-upa-contrato { font-size:.68rem; font-weight:700; color:var(--muted); margin-top:2px; }
#adm-root .tr-upa-status-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.68rem; font-weight:800; padding:.28rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .tr-upa-status-badge.ok { background:var(--green-light); color:#16a34a; }
#adm-root .tr-upa-status-badge.warn { background:var(--yellow-light); color:#b45309; }
#adm-root .tr-upa-status-badge.critico { background:var(--red-light); color:#dc2626; }

/* TURNOS */
#adm-root .tr-upa-turnos { padding:.9rem 1.4rem; display:flex; flex-direction:column; gap:.6rem; border-bottom:1px solid var(--border); }
#adm-root .tr-turno-vazio { font-size:.78rem; font-weight:600; color:var(--muted); }
#adm-root .tr-turno-row { background:var(--bg); border-radius:12px; padding:.65rem .9rem; display:flex; align-items:center; gap:.8rem; flex-wrap:wrap; }
#adm-root .tr-turno-label { font-size:.72rem; font-weight:900; color:var(--text); min-width:70px; }
#adm-root .tr-turno-horario { font-size:.64rem; font-weight:700; color:var(--muted); min-width:70px; }
#adm-root .tr-turno-medicos { display:flex; gap:.3rem; flex-wrap:wrap; flex:1; }
#adm-root .tr-turno-sem-escala { font-size:.68rem; font-weight:700; color:var(--muted); }
#adm-root .tr-med-chip { display:flex; align-items:center; gap:.3rem; padding:.22rem .55rem; border-radius:8px; font-size:.68rem; font-weight:800; }
#adm-root .tr-med-chip.presente { background:var(--green-light); color:#166534; }
#adm-root .tr-med-chip.atrasado { background:var(--yellow-light); color:#92400e; }
#adm-root .tr-med-chip.ausente { background:var(--red-light); color:#991b1b; }
#adm-root .tr-med-chip.escalado { background:var(--indigo-light); color:var(--indigo); }
#adm-root .tr-med-av { width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.52rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .tr-turno-vagas { font-size:.64rem; font-weight:800; padding:.18rem .55rem; border-radius:8px; white-space:nowrap; }
#adm-root .tr-turno-vagas.ok { background:var(--green-light); color:#16a34a; }
#adm-root .tr-turno-vagas.crit { background:var(--red-light); color:#dc2626; }
#adm-root .tr-turno-futuro { font-size:.62rem; font-weight:700; color:var(--muted); }

/* STATS UPA */
#adm-root .tr-upa-stats { padding:.8rem 1.4rem; display:grid; grid-template-columns:repeat(4,1fr); gap:.5rem; }
#adm-root .tr-upa-stat { background:var(--bg); border-radius:9px; padding:.5rem .6rem; text-align:center; }
#adm-root .tr-upa-stat-val { font-family:'Nunito',sans-serif; font-size:1rem; font-weight:900; line-height:1; }
#adm-root .tr-upa-stat-lbl { font-size:.58rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-top:2px; }

/* FOOTER UPA */
#adm-root .tr-upa-footer { padding:.65rem 1.4rem; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:.6rem; flex-wrap:wrap; }
#adm-root .tr-upa-footer-info { font-size:.68rem; font-weight:600; color:var(--muted); }
#adm-root .tr-upa-footer-actions { display:flex; gap:.4rem; }
#adm-root .tr-btn-upa { display:flex; align-items:center; gap:.3rem; padding:.3rem .75rem; border-radius:8px; border:1.5px solid var(--border); background:none; font-family:'Nunito',sans-serif; font-size:.7rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .tr-btn-upa:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .tr-btn-upa.alerta { border-color:rgba(239,68,68,.3); color:var(--red); background:var(--red-light); }
#adm-root .tr-btn-upa.alerta:hover { background:rgba(239,68,68,.15); }

/* EVENTOS RECENTES */
#adm-root .tr-eventos-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; margin-bottom:1.4rem; }
#adm-root .tr-eventos-header { padding:.9rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.4rem; }
#adm-root .tr-eventos-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .tr-eventos-hint { font-size:.7rem; font-weight:700; color:var(--muted); }
#adm-root .tr-eventos-list { display:flex; flex-direction:column; max-height:280px; overflow-y:auto; }
#adm-root .tr-eventos-empty { padding:1.2rem 1.4rem; font-size:.8rem; color:var(--muted); font-weight:600; }
#adm-root .tr-evento-item { display:flex; align-items:center; gap:.8rem; padding:.7rem 1.4rem; border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .tr-evento-item:last-child { border-bottom:none; }
#adm-root .tr-evento-item:hover { background:var(--indigo-light); }
#adm-root .tr-evento-hora { font-size:.68rem; font-weight:800; color:var(--muted); min-width:44px; font-family:'Nunito',sans-serif; }
#adm-root .tr-evento-icon { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:var(--bg); }
#adm-root .tr-evento-texto { flex:1; font-size:.78rem; font-weight:700; color:var(--text); line-height:1.3; }
#adm-root .tr-evento-upa { font-size:.65rem; font-weight:800; padding:.15rem .5rem; border-radius:8px; background:var(--bg); color:var(--muted); white-space:nowrap; }

/* TOAST */
#adm-root .tr-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .tr-toast.show { transform:translateY(0); opacity:1; }

/* DARK MODE */
#adm-root.dark .tr-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .tr-relogio { background:rgba(99,102,241,.15); }
#adm-root.dark .tr-btn-atualizar { border-color:rgba(255,255,255,.1); color:#94a3b8; }
#adm-root.dark .tr-contrato-tab { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .tr-upa-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .tr-turno-row { background:#0f1119; }
#adm-root.dark .tr-upa-stat { background:#0f1119; }
#adm-root.dark .tr-eventos-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .tr-evento-item:hover { background:rgba(99,102,241,.1); }
#adm-root.dark .tr-evento-icon { background:#0f1119; }
#adm-root.dark .tr-evento-upa { background:#0f1119; }
#adm-root.dark .tr-empty { background:#1a1f36; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .tr-hamburger { display:flex; }
  #adm-root .tr-topbar { padding:.85rem 1rem; }
  #adm-root .tr-topbar-title { font-size:.88rem; line-height:1.2; }
  #adm-root .tr-topbar-sub { font-size:.62rem; }
  #adm-root .tr-topbar-right { width:100%; justify-content:space-between; }
  #adm-root .tr-relogio { font-size:.9rem; padding:.3rem .7rem; }
  #adm-root .tr-live-badge span, #adm-root .tr-btn-atualizar span { display:none; }

  #adm-root .tr-content { padding:1rem; }
  #adm-root .tr-resumo-global { padding:1.1rem 1.2rem; flex-direction:column; align-items:flex-start; }
  #adm-root .tr-rg-titulo-val { font-size:1.4rem; }
  #adm-root .tr-rg-stats { gap:.6rem; width:100%; }
  #adm-root .tr-rg-stat { min-width:unset; flex:1; padding:.6rem .5rem; }
  #adm-root .tr-rg-stat-val { font-size:1.2rem; }

  #adm-root .tr-contrato-tabs { overflow-x:auto; -webkit-overflow-scrolling:touch; flex-wrap:nowrap; padding-bottom:.3rem; }
  #adm-root .tr-contrato-tab { flex-shrink:0; }

  #adm-root .tr-upas-grid { grid-template-columns:1fr; }
  #adm-root .tr-upa-header { padding:.85rem 1rem; }
  #adm-root .tr-upa-turnos { padding:.75rem 1rem; }
  #adm-root .tr-upa-stats { padding:.7rem 1rem; grid-template-columns:repeat(2,1fr); gap:.5rem; }
  #adm-root .tr-upa-footer { padding:.6rem 1rem; flex-direction:column; align-items:stretch; }
  #adm-root .tr-upa-footer-actions { width:100%; }
  #adm-root .tr-btn-upa { flex:1; justify-content:center; }

  #adm-root .tr-turno-label, #adm-root .tr-turno-horario { min-width:unset; }
}

@media (max-width: 480px) {
  #adm-root .tr-topbar-title { font-size:.82rem; }
  #adm-root .tr-topbar-sub { display:none; }
  #adm-root .tr-rg-stats { flex-wrap:wrap; }
  #adm-root .tr-rg-stat { min-width:70px; flex:1 1 40%; }
  #adm-root .tr-upa-stats { grid-template-columns:repeat(2,1fr); }
}
`;
