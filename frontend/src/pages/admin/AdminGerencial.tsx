/**
 * Admin OS — Relatório Gerencial.
 * Dashboard executivo mensal: KPIs de SLA, contratos vs meta, ranking UPAs,
 * médicos com mais ocorrências, tendências, evolução histórica (canvas) e
 * pontos para reunião. Substitui o mock estático em
 *   /originais/OS/admin-gerencial.html
 * por dados reais vindos de GET /api/management-report.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { managementReportApi } from '../../api/managementReportApi';
import type { ManagementReportResponse, TrendDirection } from '../../api/managementReportApi';
import { formatLongDateBR, formatMonthYearBR } from '../../utils/dateTimeBR';

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtPct(v: number) {
  return v.toFixed(1).replace('.', ',') + '%';
}

function fmtCurrency(v?: number | null) {
  if (v == null) return '—';
  if (v >= 1_000_000) return 'R$' + (v / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1_000) return 'R$' + Math.round(v / 1_000) + 'k';
  return 'R$' + v.toFixed(0);
}

function badgeClassFor(status: 'ok' | 'warn' | 'crit') {
  return status === 'ok' ? 'ger-badge ger-badge-ok' : status === 'warn' ? 'ger-badge ger-badge-warn' : 'ger-badge ger-badge-crit';
}

function trendClass(d: TrendDirection) {
  return d === 'up' ? 't-up' : d === 'down' ? 't-down' : 't-flat';
}

function arrowFor(d: TrendDirection) {
  return d === 'up' ? '↑ Em alta' : d === 'down' ? '↓ Em queda' : '→ Estável';
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#6b7280', '#6366f1'];
const RANK_POS = ['pos-1', 'pos-2', 'pos-3', 'pos-4', 'pos-5'];
const DOCTOR_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#6b7280', '#f97316'];

const TREND_ICONS: Record<string, string> = {
  'sla-trend': '📈',
  'critical-doctors': '👩‍⚕️',
  'top-clinic': '🏥',
  'alert-clinic': '⚠️',
  substitutions: '🔄',
  justifications: '📋',
};
const TREND_COLORS: Record<string, { fg: string; bg: string }> = {
  'sla-trend': { fg: 'var(--green)', bg: 'var(--green-light)' },
  'critical-doctors': { fg: 'var(--yellow)', bg: 'var(--yellow-light)' },
  'top-clinic': { fg: 'var(--indigo)', bg: 'var(--indigo-light)' },
  'alert-clinic': { fg: 'var(--orange)', bg: 'var(--orange-light)' },
  substitutions: { fg: 'var(--purple)', bg: 'var(--purple-light)' },
  justifications: { fg: 'var(--blue)', bg: 'var(--blue-light)' },
};

export function AdminGerencial({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ManagementReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Últimos 5 meses relativos ao mês corrente do sistema
  const monthTabs = useMemo(() => {
    const tabs: { y: number; m: number; label: string }[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      tabs.push({ y: d.getFullYear(), m: d.getMonth() + 1, label: MONTHS_SHORT[d.getMonth()] });
    }
    return tabs;
  }, [now]);

  useEffect(() => {
    setLoading(true);
    managementReportApi.getReport(year, month)
      .then(r => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    drawEvolutionChart(canvasRef.current, data);
    const onResize = () => canvasRef.current && data && drawEvolutionChart(canvasRef.current, data);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [data]);

  function selectMonth(y: number, m: number) {
    setYear(y); setMonth(m);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const topbarDate = formatLongDateBR(now);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="ger-topbar">
        <div className="ger-topbar-left">
          <button className="ger-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div>
            <div className="ger-topbar-title">Relatório Gerencial</div>
            <div className="ger-topbar-sub">{topbarDate}</div>
          </div>
        </div>
        <div className="ger-topbar-right">
          <button className="ger-btn-export ger-btn-pdf" onClick={() => showToast('Relatório PDF gerado com sucesso!')} aria-label="Exportar PDF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span className="ger-btn-label">Exportar PDF</span>
          </button>
          <button className="ger-btn-export ger-btn-ppt" onClick={() => showToast('Apresentação gerada com sucesso!')} aria-label="Apresentação">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
            <span className="ger-btn-label">Apresentação</span>
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

      <div className="ger-content">
        {/* Período */}
        <div className="ger-periodo-bar">
          <div>
            <div className="ger-periodo-label">Período de análise</div>
            <div className="ger-periodo-tabs">
              {monthTabs.map(t => (
                <button
                  key={`${t.y}-${t.m}`}
                  className={`ger-periodo-tab ${t.y === year && t.m === month ? 'active' : ''}`}
                  onClick={() => selectMonth(t.y, t.m)}
                >{t.label}</button>
              ))}
            </div>
          </div>
          <div className="ger-periodo-info">
            <div className="ger-periodo-label">Referência atual</div>
            <div className="ger-periodo-val">
              {data?.periodLabel || `${MONTHS_SHORT[month - 1]} ${year}`}
              {data && (
                <span className={`ger-vs-badge ${data.slaGlobal.direction === 'up' ? 'vs-up' : data.slaGlobal.direction === 'down' ? 'vs-down' : 'vs-flat'}`}>
                  SLA {fmtPct(data.slaGlobal.value)}
                </span>
              )}
            </div>
          </div>
        </div>

        {loading && !data ? (
          <div className="ger-loading">Carregando relatório…</div>
        ) : !data ? (
          <div className="ger-empty">Não foi possível carregar o relatório do período.</div>
        ) : (
          <>
            {/* KPIs Hero */}
            <div className="ger-kpi-hero">
              <div className="ger-kpi-hcard featured">
                <div className="ger-kpi-hlbl">SLA global OS</div>
                <div className="ger-kpi-hval">{fmtPct(data.slaGlobal.value)}</div>
                <div className="ger-kpi-hsub">média entre todos os contratos</div>
                <div className={`ger-kpi-trend ${trendClass(data.slaGlobal.direction)}`}>{data.slaGlobal.label}</div>
              </div>
              <div className="ger-kpi-hcard">
                <div className="ger-kpi-hlbl">Total de ausências</div>
                <div className="ger-kpi-hval" style={{ color: 'var(--red)' }}>{data.totalAbsences.value}</div>
                <div className="ger-kpi-hsub">plantões não cumpridos</div>
                <div className={`ger-kpi-trend ${trendClass(data.totalAbsences.direction)}`}>{data.totalAbsences.label}</div>
              </div>
              <div className="ger-kpi-hcard">
                <div className="ger-kpi-hlbl">Atrasos registrados</div>
                <div className="ger-kpi-hval" style={{ color: 'var(--yellow)' }}>{data.totalLateEvents.value}</div>
                <div className="ger-kpi-hsub">acima da tolerância</div>
                <div className={`ger-kpi-trend ${trendClass(data.totalLateEvents.direction)}`}>{data.totalLateEvents.label}</div>
              </div>
              <div className="ger-kpi-hcard">
                <div className="ger-kpi-hlbl">Contratos no SLA</div>
                <div className="ger-kpi-hval" style={{ color: 'var(--green)' }}>{data.contractsInSla.inSla} / {data.contractsInSla.total}</div>
                <div className="ger-kpi-hsub">acima da meta contratual</div>
                <div className={`ger-kpi-trend ${trendClass(data.contractsInSla.direction)}`}>{data.contractsInSla.label}</div>
              </div>
            </div>

            {/* SLA por Contrato */}
            <div className="ger-section-title">Cumprimento de SLA por Contrato</div>
            {data.contracts.length === 0 ? (
              <div className="ger-empty-inline">Nenhum contrato cadastrado ainda.</div>
            ) : (
              <div className="ger-contratos-grid">
                {data.contracts.map(c => (
                  <div className="ger-contrato-sla" key={c.contractId}>
                    <div className="ger-csl-top">
                      <div>
                        <div className="ger-csl-nome">{c.publicOrganName}</div>
                        <div className="ger-csl-contrato">
                          {c.contractNumber}
                          {c.startDate && c.endDate && ` · ${formatMonthYearBR(c.startDate)}–${formatMonthYearBR(c.endDate)}`}
                        </div>
                      </div>
                      <span className={badgeClassFor(c.status)}>{c.status === 'ok' ? '✓ Na meta' : c.status === 'warn' ? '⚠ Abaixo da meta' : '● Crítico'}</span>
                    </div>
                    <div className="ger-sla-bar-wrap">
                      <div className="ger-sla-info">
                        <span className="ger-sla-label">SLA atual</span>
                        <span className="ger-sla-pct" style={{ color: c.status === 'ok' ? 'var(--green)' : c.status === 'warn' ? 'var(--yellow)' : 'var(--red)' }}>{fmtPct(c.slaPercent)}</span>
                        <span className="ger-sla-meta">Meta: {fmtPct(c.targetPercent)}</span>
                      </div>
                      <div className="ger-sla-bg">
                        <div className="ger-sla-fill" style={{ width: `${Math.min(100, c.slaPercent)}%`, background: c.status === 'ok' ? 'var(--green)' : c.status === 'warn' ? 'var(--yellow)' : 'var(--red)' }} />
                        <div className="ger-sla-meta-line" style={{ left: `${c.targetPercent}%` }} />
                      </div>
                    </div>
                    <div className="ger-csl-stats">
                      <div className="ger-csl-stat"><div className="ger-csl-stat-lbl">UPAs</div><div className="ger-csl-stat-val" style={{ color: 'var(--indigo)' }}>{c.clinicCount}</div></div>
                      <div className="ger-csl-stat"><div className="ger-csl-stat-lbl">Ausências</div><div className="ger-csl-stat-val" style={{ color: 'var(--red)' }}>{c.absenceCount}</div></div>
                      <div className="ger-csl-stat"><div className="ger-csl-stat-lbl">Valor</div><div className="ger-csl-stat-val" style={{ color: 'var(--green)' }}>{fmtCurrency(c.monthlyValue)}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Ranking + Médicos com problemas */}
            <div className="ger-mid-grid">
              <div className="ger-card">
                <div className="ger-card-header">
                  <div className="ger-card-title">Ranking de UPAs</div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                </div>
                <div className="ger-card-body">
                  {data.clinicRanking.length === 0 ? (
                    <div className="ger-empty-inline">Sem plantões no período.</div>
                  ) : (
                    <div className="ger-upa-rank-list">
                      {data.clinicRanking.map((u, i) => (
                        <div className="ger-upa-rank-item" key={u.clinicId}>
                          <div className={`ger-upa-rank-pos ${RANK_POS[i] || ''}`}>{i + 1}º</div>
                          <div className="ger-upa-rank-bar">
                            <div className="ger-upa-rank-name">
                              <span>UPA – {u.clinicName}</span>
                              <span className="ger-upa-rank-pct" style={{ color: RANK_COLORS[i % RANK_COLORS.length] }}>{fmtPct(u.slaPercent)}</span>
                            </div>
                            <div className="ger-upa-bg"><div className="ger-upa-fill" style={{ width: `${Math.min(100, u.slaPercent)}%`, background: RANK_COLORS[i % RANK_COLORS.length] }} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="ger-card">
                <div className="ger-card-header">
                  <div className="ger-card-title">Médicos com mais ocorrências</div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <div className="ger-card-body">
                  {data.problemDoctors.length === 0 ? (
                    <div className="ger-empty-inline">Nenhuma ocorrência no período.</div>
                  ) : (
                    <div className="ger-med-prob-list">
                      {data.problemDoctors.map((m, i) => (
                        <div className="ger-med-prob-item" key={m.userId}>
                          <div className="ger-med-prob-av" style={{ background: DOCTOR_COLORS[i % DOCTOR_COLORS.length] }}>{m.initials}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="ger-med-prob-name">{m.userName}</div>
                            <div className="ger-med-prob-upa">{m.clinicName || '—'}</div>
                          </div>
                          <div className="ger-med-prob-score" style={{ color: m.occurrenceCount >= 8 ? 'var(--red)' : m.occurrenceCount >= 5 ? 'var(--yellow)' : 'var(--muted)' }}>{m.occurrenceCount} oc.</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tendências */}
            <div className="ger-section-title">Tendências do mês</div>
            <div className="ger-tendencias-grid">
              {data.trends.map(t => {
                const colors = TREND_COLORS[t.key] || { fg: 'var(--muted)', bg: 'var(--bg)' };
                return (
                  <div className="ger-tend-card" key={t.key}>
                    <div className="ger-tend-icon" style={{ background: colors.bg }}>{TREND_ICONS[t.key] || '📊'}</div>
                    <div>
                      <div className="ger-tend-lbl">{t.label}</div>
                      <div className="ger-tend-val" style={{ color: colors.fg }}>{t.value}</div>
                      <div className="ger-tend-sub">{t.subLabel}</div>
                      <div className={`ger-tend-trend ${t.direction}`}>{arrowFor(t.direction)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Evolução + Destaques */}
            <div className="ger-mid-grid">
              <div className="ger-card">
                <div className="ger-card-header"><div className="ger-card-title">Evolução do SLA — últimos 5 meses</div></div>
                <div className="ger-card-body">
                  <div className="ger-chart-wrap">
                    <canvas ref={canvasRef} />
                  </div>
                  <div className="ger-chart-legend">
                    {data.evolution.contractSeries.map(s => (
                      <div className="ger-leg-item" key={s.contractId}>
                        <div className="ger-leg-dot" style={{ background: s.color }} />
                        {s.label} (%)
                      </div>
                    ))}
                    <div className="ger-leg-item">
                      <div className="ger-leg-dot ger-leg-dashed" />
                      Ausências (qtd)
                    </div>
                  </div>
                </div>
              </div>

              <div className="ger-card">
                <div className="ger-card-header">
                  <div className="ger-card-title">Pontos para a reunião</div>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <div className="ger-card-body">
                  <div className="ger-destaques-list">
                    {data.highlights.map((h, i) => (
                      <div className={`ger-dest-item ${h.kind}`} key={i}>
                        <div className="ger-dest-icon">{h.kind === 'pos' ? '✓' : h.kind === 'neg' ? '!' : 'ℹ'}</div>
                        <div className="ger-dest-text">{h.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && <div className="ger-toast show"><span>{toast}</span></div>}
    </>
  );
}

// ── Canvas do gráfico ─────────────────────────────────────────────────────

function drawEvolutionChart(canvas: HTMLCanvasElement, data: ManagementReportResponse) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  canvas.width = W;
  canvas.height = H;
  const pad = { top: 16, right: 16, bottom: 28, left: 36 };
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top - pad.bottom;
  const n = data.evolution.months.length;
  if (n === 0) return;
  const xStep = n > 1 ? gW / (n - 1) : gW;
  const yMin = 0, yMax = 100;
  const absMax = Math.max(1, ...data.evolution.absencesByMonth);

  const xPos = (i: number) => pad.left + i * xStep;
  const yPct = (v: number) => pad.top + gH - ((v - yMin) / (yMax - yMin)) * gH;
  const yAus = (v: number) => pad.top + gH - (v / absMax) * gH;

  ctx.clearRect(0, 0, W, H);

  // Grade horizontal
  ctx.strokeStyle = 'rgba(0,0,0,.06)';
  ctx.lineWidth = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const y = pad.top + gH * t;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
  });

  // Ausências (linha tracejada vermelha)
  if (data.evolution.absencesByMonth.length > 0) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    data.evolution.absencesByMonth.forEach((v, i) => {
      const x = xPos(i);
      const y = yAus(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Séries de contrato (área + linha + pontos)
  data.evolution.contractSeries.forEach(s => {
    if (s.values.length === 0) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.2;

    // Área
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = xPos(i);
      const y = yPct(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xPos(n - 1), pad.top + gH);
    ctx.lineTo(xPos(0), pad.top + gH);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
    g.addColorStop(0, s.color + '28');
    g.addColorStop(1, s.color + '03');
    ctx.fillStyle = g;
    ctx.fill();

    // Linha
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = xPos(i);
      const y = yPct(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Pontos
    s.values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(xPos(i), yPct(v), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });

  // Labels dos meses
  ctx.fillStyle = '#7a9090';
  ctx.font = '700 10px "Nunito Sans"';
  ctx.textAlign = 'center';
  data.evolution.months.forEach((m, i) => ctx.fillText(m, xPos(i), H - 5));
}

// ── CSS (prefixo ger-) ────────────────────────────────────────────────────

const CSS = `
#adm-root .ger-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; gap:.7rem; }
#adm-root .ger-topbar-left { display:flex; align-items:center; gap:.75rem; min-width:0; }
#adm-root .ger-topbar-right { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
#adm-root .ger-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .ger-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .ger-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .ger-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }

#adm-root .ger-btn-export { display:flex; align-items:center; gap:.4rem; padding:.5rem 1rem; border-radius:10px; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:all .15s; border:1.5px solid; background:none; }
#adm-root .ger-btn-pdf { color:#e05555; border-color:rgba(224,85,85,.3); background:rgba(224,85,85,.06); }
#adm-root .ger-btn-pdf:hover { background:rgba(224,85,85,.12); }
#adm-root .ger-btn-ppt { color:var(--orange); border-color:rgba(249,115,22,.3); background:var(--orange-light); }
#adm-root .ger-btn-ppt:hover { background:rgba(249,115,22,.12); }

#adm-root .ger-content { flex:1; padding:2rem; overflow-y:auto; animation:ger-fadeUp .35s ease; }
@keyframes ger-fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

/* Período */
#adm-root .ger-periodo-bar { display:flex; align-items:center; justify-content:space-between; background:var(--surface); border:1.5px solid var(--border); border-radius:16px; padding:.9rem 1.4rem; margin-bottom:1.4rem; flex-wrap:wrap; gap:.8rem; }
#adm-root .ger-periodo-label { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:.4rem; }
#adm-root .ger-periodo-tabs { display:flex; background:var(--bg); border-radius:10px; padding:3px; border:1.5px solid var(--border); }
#adm-root .ger-periodo-tab { padding:.4rem 1rem; border-radius:8px; border:none; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:all .15s; background:none; color:var(--muted); }
#adm-root .ger-periodo-tab.active { background:var(--surface); color:var(--indigo); box-shadow:0 1px 4px rgba(0,0,0,.1); }
#adm-root .ger-periodo-info { text-align:right; }
#adm-root .ger-periodo-val { font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:900; color:var(--text); }
#adm-root .ger-vs-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.7rem; font-weight:800; padding:.2rem .6rem; border-radius:10px; margin-left:.5rem; }
#adm-root .ger-vs-badge.vs-up { background:var(--green-light); color:#16a34a; }
#adm-root .ger-vs-badge.vs-down { background:var(--red-light); color:#dc2626; }
#adm-root .ger-vs-badge.vs-flat { background:var(--yellow-light); color:#b45309; }

/* Loading/Empty */
#adm-root .ger-loading, #adm-root .ger-empty { text-align:center; padding:3rem; color:var(--muted); font-weight:700; font-size:.9rem; background:var(--surface); border-radius:16px; border:1.5px dashed var(--border); }
#adm-root .ger-empty-inline { text-align:center; padding:1.5rem; color:var(--muted); font-weight:600; font-size:.82rem; }

/* KPIs */
#adm-root .ger-kpi-hero { display:grid; grid-template-columns:repeat(4, 1fr); gap:1rem; margin-bottom:1.4rem; }
#adm-root .ger-kpi-hcard { background:var(--surface); border-radius:20px; border:1.5px solid var(--border); padding:1.3rem 1.4rem; position:relative; overflow:hidden; transition:transform .15s, box-shadow .15s; }
#adm-root .ger-kpi-hcard:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.07); }
#adm-root .ger-kpi-hcard.featured { background:linear-gradient(135deg,#1a1f36 0%,#2d3561 55%,#3d4a8a 100%); border:none; }
#adm-root .ger-kpi-hlbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.4rem; }
#adm-root .ger-kpi-hcard.featured .ger-kpi-hlbl { color:rgba(255,255,255,.7); }
#adm-root .ger-kpi-hval { font-family:'Nunito',sans-serif; font-size:2.2rem; font-weight:900; line-height:1; margin-bottom:.3rem; }
#adm-root .ger-kpi-hcard.featured .ger-kpi-hval { color:#fff; }
#adm-root .ger-kpi-hsub { font-size:.7rem; font-weight:600; color:var(--muted); }
#adm-root .ger-kpi-hcard.featured .ger-kpi-hsub { color:rgba(255,255,255,.6); }
#adm-root .ger-kpi-trend { display:inline-flex; align-items:center; gap:.25rem; font-size:.68rem; font-weight:800; padding:.18rem .55rem; border-radius:10px; margin-top:.4rem; }
#adm-root .ger-kpi-trend.t-up { background:var(--green-light); color:#16a34a; }
#adm-root .ger-kpi-trend.t-down { background:var(--red-light); color:#dc2626; }
#adm-root .ger-kpi-trend.t-flat { background:var(--yellow-light); color:#b45309; }
#adm-root .ger-kpi-hcard.featured .ger-kpi-trend { background:rgba(255,255,255,.18); color:#fff; }

/* Section title */
#adm-root .ger-section-title { font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:900; color:var(--text); margin-bottom:1rem; }

/* Contratos */
#adm-root .ger-contratos-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:1rem; margin-bottom:1.4rem; }
#adm-root .ger-contrato-sla { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); padding:1.3rem 1.5rem; transition:box-shadow .15s; }
#adm-root .ger-contrato-sla:hover { box-shadow:0 6px 20px rgba(99,102,241,.1); }
#adm-root .ger-csl-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; gap:.7rem; }
#adm-root .ger-csl-nome { font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:900; color:var(--text); }
#adm-root .ger-csl-contrato { font-size:.68rem; font-weight:700; color:var(--muted); margin-top:2px; }
#adm-root .ger-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .ger-badge-ok { background:var(--green-light); color:#16a34a; }
#adm-root .ger-badge-warn { background:var(--yellow-light); color:#b45309; }
#adm-root .ger-badge-crit { background:var(--red-light); color:#dc2626; }
#adm-root .ger-sla-bar-wrap { margin-bottom:.8rem; }
#adm-root .ger-sla-info { display:flex; justify-content:space-between; align-items:center; margin-bottom:.4rem; }
#adm-root .ger-sla-label { font-size:.7rem; font-weight:700; color:var(--muted); }
#adm-root .ger-sla-pct { font-family:'Nunito',sans-serif; font-size:1rem; font-weight:900; }
#adm-root .ger-sla-meta { font-size:.65rem; font-weight:700; color:var(--muted); }
#adm-root .ger-sla-bg { height:10px; border-radius:10px; background:var(--bg); overflow:hidden; position:relative; }
#adm-root .ger-sla-fill { height:100%; border-radius:10px; transition:width .8s cubic-bezier(.4,0,.2,1); }
#adm-root .ger-sla-meta-line { position:absolute; top:0; bottom:0; width:2px; background:rgba(0,0,0,.2); border-radius:2px; }
#adm-root .ger-csl-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:.5rem; }
#adm-root .ger-csl-stat { background:var(--bg); border-radius:8px; padding:.45rem .6rem; text-align:center; }
#adm-root .ger-csl-stat-lbl { font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
#adm-root .ger-csl-stat-val { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; margin-top:2px; }

/* Mid grid */
#adm-root .ger-mid-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.4rem; }
#adm-root .ger-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .ger-card-header { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .ger-card-title { font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:900; color:var(--text); }
#adm-root .ger-card-body { padding:1.1rem 1.4rem; }

/* Ranking UPAs */
#adm-root .ger-upa-rank-list { display:flex; flex-direction:column; gap:.7rem; }
#adm-root .ger-upa-rank-item { display:flex; align-items:center; gap:.8rem; }
#adm-root .ger-upa-rank-pos { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; min-width:22px; text-align:center; }
#adm-root .ger-upa-rank-pos.pos-1 { color:#f59e0b; }
#adm-root .ger-upa-rank-pos.pos-2 { color:#94a3b8; }
#adm-root .ger-upa-rank-pos.pos-3 { color:#b45309; }
#adm-root .ger-upa-rank-pos.pos-4 { color:var(--muted); }
#adm-root .ger-upa-rank-bar { flex:1; min-width:0; }
#adm-root .ger-upa-rank-name { font-size:.78rem; font-weight:800; color:var(--text); display:flex; justify-content:space-between; align-items:center; margin-bottom:.3rem; gap:.4rem; }
#adm-root .ger-upa-rank-name > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#adm-root .ger-upa-rank-pct { font-family:'Nunito',sans-serif; font-size:.82rem; font-weight:900; white-space:nowrap; }
#adm-root .ger-upa-bg { height:9px; border-radius:9px; background:var(--bg); overflow:hidden; }
#adm-root .ger-upa-fill { height:100%; border-radius:9px; transition:width .8s cubic-bezier(.4,0,.2,1); }

/* Médicos problema */
#adm-root .ger-med-prob-list { display:flex; flex-direction:column; gap:.5rem; }
#adm-root .ger-med-prob-item { display:flex; align-items:center; gap:.7rem; padding:.55rem .7rem; background:var(--bg); border-radius:10px; }
#adm-root .ger-med-prob-av { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.65rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .ger-med-prob-name { font-size:.78rem; font-weight:800; color:var(--text); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#adm-root .ger-med-prob-upa { font-size:.65rem; font-weight:600; color:var(--muted); }
#adm-root .ger-med-prob-score { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; white-space:nowrap; }

/* Tendências */
#adm-root .ger-tendencias-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:.8rem; margin-bottom:1.4rem; }
#adm-root .ger-tend-card { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; display:flex; align-items:center; gap:.8rem; }
#adm-root .ger-tend-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:1.1rem; }
#adm-root .ger-tend-val { font-family:'Nunito',sans-serif; font-size:1.2rem; font-weight:900; line-height:1; margin-top:2px; }
#adm-root .ger-tend-lbl { font-size:.68rem; font-weight:700; color:var(--muted); }
#adm-root .ger-tend-sub { font-size:.66rem; font-weight:600; color:var(--muted); margin-top:2px; }
#adm-root .ger-tend-trend { font-size:.68rem; font-weight:800; margin-top:3px; }
#adm-root .ger-tend-trend.up { color:var(--green); }
#adm-root .ger-tend-trend.down { color:var(--red); }
#adm-root .ger-tend-trend.flat { color:var(--yellow); }

/* Gráfico */
#adm-root .ger-chart-wrap { position:relative; height:200px; margin-top:.5rem; }
#adm-root .ger-chart-wrap canvas { width:100%; height:100%; }
#adm-root .ger-chart-legend { display:flex; gap:1rem; justify-content:center; margin-top:.7rem; flex-wrap:wrap; }
#adm-root .ger-leg-item { display:flex; align-items:center; gap:.35rem; font-size:.7rem; font-weight:700; color:var(--muted); }
#adm-root .ger-leg-dot { width:12px; height:3px; border-radius:2px; }
#adm-root .ger-leg-dashed { background:repeating-linear-gradient(to right, var(--red) 0 3px, transparent 3px 6px); height:2px; }

/* Destaques */
#adm-root .ger-destaques-list { display:flex; flex-direction:column; gap:.6rem; }
#adm-root .ger-dest-item { display:flex; gap:.7rem; align-items:flex-start; padding:.8rem .9rem; border-radius:12px; border:1px solid; }
#adm-root .ger-dest-item.pos { background:var(--green-light); border-color:rgba(34,197,94,.2); }
#adm-root .ger-dest-item.neg { background:var(--red-light); border-color:rgba(239,68,68,.2); }
#adm-root .ger-dest-item.neu { background:var(--blue-light); border-color:rgba(59,130,246,.2); }
#adm-root .ger-dest-icon { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-weight:900; font-size:.85rem; }
#adm-root .ger-dest-item.pos .ger-dest-icon { background:rgba(34,197,94,.15); color:var(--green); }
#adm-root .ger-dest-item.neg .ger-dest-icon { background:rgba(239,68,68,.1); color:var(--red); }
#adm-root .ger-dest-item.neu .ger-dest-icon { background:rgba(59,130,246,.1); color:var(--blue); }
#adm-root .ger-dest-text { font-size:.78rem; font-weight:700; line-height:1.45; }
#adm-root .ger-dest-item.pos .ger-dest-text { color:#166534; }
#adm-root .ger-dest-item.neg .ger-dest-text { color:#991b1b; }
#adm-root .ger-dest-item.neu .ger-dest-text { color:#1d4ed8; }

/* Toast */
#adm-root .ger-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); z-index:200; }
#adm-root .ger-toast.show { animation:ger-toast-in .3s ease; }
@keyframes ger-toast-in { from{opacity:0;transform:translateY(80px)} to{opacity:1;transform:translateY(0)} }

/* Dark mode */
#adm-root.dark .ger-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .ger-kpi-hcard { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .ger-contrato-sla { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .ger-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .ger-tend-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .ger-periodo-bar { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .ger-med-prob-item { background:#0f1119; }
#adm-root.dark .ger-csl-stat { background:#0f1119; }
#adm-root.dark .ger-loading, #adm-root.dark .ger-empty { background:#1a1f36; }

/* Responsive tablet ~1100px */
@media (max-width: 1100px) {
  #adm-root .ger-kpi-hero { grid-template-columns:repeat(2, 1fr); }
  #adm-root .ger-contratos-grid { grid-template-columns:1fr; }
  #adm-root .ger-mid-grid { grid-template-columns:1fr; }
  #adm-root .ger-tendencias-grid { grid-template-columns:repeat(2, 1fr); }
}

/* Responsive mobile ~768px */
@media (max-width: 768px) {
  #adm-root .ger-hamburger { display:flex; }
  #adm-root .ger-topbar { padding:.85rem 1rem; flex-wrap:wrap; }
  #adm-root .ger-topbar-title { font-size:.9rem; line-height:1.2; }
  #adm-root .ger-topbar-sub { font-size:.62rem; }
  #adm-root .ger-content { padding:1rem; }
  #adm-root .ger-btn-label { display:none; }
  #adm-root .ger-btn-export { padding:.5rem .65rem; }
  #adm-root .ger-periodo-bar { flex-direction:column; align-items:stretch; }
  #adm-root .ger-periodo-info { text-align:left; }
  #adm-root .ger-periodo-tabs { overflow-x:auto; }
  #adm-root .ger-kpi-hero { grid-template-columns:1fr; gap:.75rem; }
  #adm-root .ger-kpi-hval { font-size:1.7rem; }
  #adm-root .ger-tendencias-grid { grid-template-columns:1fr; }
  #adm-root .ger-tend-val { font-size:1.05rem; }
  #adm-root .ger-chart-wrap { height:180px; }
}
`;
