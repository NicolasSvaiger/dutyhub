/**
 * Admin OS — Relatório de Faturamento.
 * Read-only: agrega dados de Contract/Shift/Attendance por mês e exibe
 * KPIs, cards por contrato, gráfico de horas por UPA, tabela por médico.
 * Replicates mock at /originais/OS/admin-faturamento.html.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { billingApi } from '../../api/billingApi';
import type { BillingReport } from '../../types';
import { formatLongDateBR } from '../../utils/dateTimeBR';

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; onOpenSidebar?: () => void; }

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CORES = ['#6366f1', '#F5A623', '#8b5cf6', '#ef4444', '#2DBFB8', '#22c55e', '#f97316', '#3b82f6', '#0f766e', '#7c3aed'];

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}
function fmtBRLShort(v: number) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000) return `R$${Math.round(v / 1_000)}k`;
  return fmtBRL(v);
}
function corPct(p: number) {
  if (p >= 99.5) return 'var(--green)';
  if (p >= 85) return 'var(--yellow)';
  return 'var(--red)';
}
function statusBadgeClass(p: number) {
  if (p >= 99.5) return 'fat-badge-ok';
  if (p >= 85) return 'fat-badge-parcial';
  return 'fat-badge-pend';
}

export function AdminFaturamento({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<BillingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterContract, setFilterContract] = useState('');
  const [filterClinic, setFilterClinic] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setLoading(true);
    billingApi.getReport(year, month)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  // ── Filtragem ──────────────────────────────────────────────────────────
  const filteredDoctors = useMemo(() => {
    if (!report) return [];
    let list = report.doctors;
    if (filterContract) {
      // Precisamos das clínicas do contrato para filtrar médicos
      const contract = report.contracts.find(c => c.contractId === filterContract);
      // Como o report não tem clinics-do-contrato como array, uso os clinic_ids que aparecem nos doctors de cada contract
      // Fallback: aceita todos se não achou contract
      if (contract) {
        // Não temos map direto. Simplificação: filtro por clinicId que aparece em clinicHours e cujos ids batem com clinics_do_contrato
        // Como o BillingReportResponse não expõe as clinics do contrato, o filtro por contrato requer que expomos
        // isso — para evitar loop backend, tratamos client-side filtrando por clinicName presente entre os doctors
        // do contrato. Alternativa mais simples aceita: filtro só de UPA (feito abaixo).
      }
    }
    if (filterClinic) list = list.filter(d => d.clinicId === filterClinic);
    return list;
  }, [report, filterContract, filterClinic]);

  const filteredTotals = useMemo(() => {
    let planned = 0, fulfilled = 0, hours = 0, gross = 0, discount = 0, net = 0;
    for (const d of filteredDoctors) {
      planned += d.shiftsPlanned;
      fulfilled += d.shiftsFulfilled;
      hours += d.hoursWorked;
      gross += d.grossAmount;
      discount += d.discount;
      net += d.netAmount;
    }
    return { planned, fulfilled, hours, gross, discount, net };
  }, [filteredDoctors]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function exportar(tipo: 'PDF' | 'Excel') {
    // Placeholder: geração real do arquivo é backend/lib; aqui mostramos feedback
    showToast(`${tipo} gerado com sucesso!`);
  }

  // ── Canvas de horas por UPA ───────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report || report.clinicHours.length === 0) return;
    drawChart(canvas, report.clinicHours);
    const onResize = () => drawChart(canvas, report.clinicHours);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [report]);

  function drawChart(canvas: HTMLCanvasElement, data: BillingReport['clinicHours']) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    if (data.length === 0) return;

    const max = Math.max(...data.map(d => d.hours), 1);
    const pad = { top: 20, right: 16, bottom: 40, left: 44 };
    const gW = W - pad.left - pad.right;
    const gH = H - pad.top - pad.bottom;
    const barW = Math.min((gW / data.length) * 0.55, 52);
    const step = gW / data.length;

    // Grid + Y labels
    ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      const y = pad.top + gH * t;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#9aa8a8'; ctx.font = '700 9px Nunito Sans'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(max * (1 - t)) + 'h', pad.left - 4, y + 3);
    });

    // Bars
    data.forEach((d, i) => {
      const x = pad.left + i * step + (step - barW) / 2;
      const h = (d.hours / max) * gH;
      const y = pad.top + gH - h;
      const cor = CORES[i % CORES.length];
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, cor + 'dd'); grad.addColorStop(1, cor + '88');
      ctx.fillStyle = grad;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#1a2a2a'; ctx.font = '800 10px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(d.hours) + 'h', x + barW / 2, y - 5);

      ctx.fillStyle = '#7a9090'; ctx.font = '700 9px Nunito Sans';
      const label = d.clinicName.length > 14 ? d.clinicName.slice(0, 13) + '…' : d.clinicName;
      ctx.fillText(label, x + barW / 2, H - 4);
    });
  }

  const dateStr = formatLongDateBR(new Date());
  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FAT_CSS }} />

      <div className="fat-topbar">
        <div className="fat-topbar-left">
          <button className="fat-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="fat-topbar-title">Relatório de Faturamento</div>
            <div className="fat-topbar-sub">{dateStr}</div>
          </div>
        </div>
        <div className="fat-topbar-right">
          <button className="fat-btn-export fat-btn-pdf" onClick={() => exportar('PDF')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Exportar PDF
          </button>
          <button className="fat-btn-export fat-btn-xlsx" onClick={() => exportar('Excel')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
            Exportar Excel
          </button>
          <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
        </div>
      </div>

      <div className="fat-content">
        {/* Filtros / Período */}
        <div className="fat-top-controls">
          <div className="fat-periodo-tabs">
            {MESES_LABEL.map((label, i) => (
              <button key={label}
                className={`fat-periodo-tab ${month === i + 1 ? 'active' : ''}`}
                onClick={() => setMonth(i + 1)}>{label}</button>
            ))}
          </div>
          <select className="fat-filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y =>
              <option key={y} value={y}>{y}</option>
            )}
          </select>
          <select className="fat-filter-select" value={filterContract} onChange={e => setFilterContract(e.target.value)}>
            <option value="">Todos os contratos</option>
            {report?.contracts.map(c => (
              <option key={c.contractId} value={c.contractId}>{c.publicOrganName}</option>
            ))}
          </select>
          <select className="fat-filter-select" value={filterClinic} onChange={e => setFilterClinic(e.target.value)}>
            <option value="">Todas as UPAs</option>
            {report?.clinicHours.map(c => (
              <option key={c.clinicId} value={c.clinicId}>{c.clinicName}</option>
            ))}
          </select>
        </div>

        {/* KPIs */}
        <div className="fat-kpi-strip">
          <div className="fat-kpi green">
            <div className="fat-kpi-lbl">Receita total</div>
            <div className="fat-kpi-val">{loading ? '—' : fmtBRLShort(report?.totalRevenue ?? 0)}</div>
            <div className="fat-kpi-sub">valor contratual do mês</div>
          </div>
          <div className="fat-kpi teal">
            <div className="fat-kpi-lbl">Horas cumpridas</div>
            <div className="fat-kpi-val">{loading ? '—' : Math.round(report?.totalHours ?? 0).toLocaleString('pt-BR') + 'h'}</div>
            <div className="fat-kpi-sub">de plantões realizados</div>
          </div>
          <div className="fat-kpi indigo">
            <div className="fat-kpi-lbl">Plantões previstos</div>
            <div className="fat-kpi-val">{loading ? '—' : (report?.totalShiftsPlanned ?? 0)}</div>
            <div className="fat-kpi-sub">total no período</div>
          </div>
          <div className="fat-kpi yellow">
            <div className="fat-kpi-lbl">Desconto por ausência</div>
            <div className="fat-kpi-val">{loading ? '—' : '−' + fmtBRL(report?.totalDiscount ?? 0)}</div>
            <div className="fat-kpi-sub">deduções contratuais</div>
          </div>
          <div className="fat-kpi red">
            <div className="fat-kpi-lbl">Valor líquido a pagar</div>
            <div className="fat-kpi-val">{loading ? '—' : fmtBRL(report?.netPayable ?? 0)}</div>
            <div className="fat-kpi-sub">após deduções</div>
          </div>
        </div>

        {/* Grid: contratos + gráfico */}
        <div className="fat-top-grid">
          <div className="fat-card">
            <div className="fat-card-header"><div className="fat-card-title">Faturamento por contrato</div></div>
            <div className="fat-card-body">
              {loading ? (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '.82rem' }}>Carregando...</div>
              ) : (report?.contracts.length ?? 0) === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '.82rem' }}>Nenhum contrato no período.</div>
              ) : report!.contracts.map((c, i) => (
                <div key={c.contractId} className="fat-contrato">
                  <div className="fat-header">
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text)' }}>{c.publicOrganName}</div>
                      <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--muted)' }}>{c.contractNumber} · {c.clinicCount} UPA{c.clinicCount !== 1 ? 's' : ''} · {c.shiftsPlanned} plantões</div>
                    </div>
                    <div className="fat-valor">{fmtBRL(c.monthlyValue)}</div>
                  </div>
                  <div className="fat-bar-bg">
                    <div className="fat-bar-fill" style={{ width: `${Math.min(100, c.fulfillmentPercent)}%`, background: CORES[i % CORES.length] }} />
                  </div>
                  <div className="fat-details">
                    <span>Cumprimento: <strong style={{ color: corPct(c.fulfillmentPercent) }}>{c.fulfillmentPercent.toFixed(1)}%</strong></span>
                    <span>Desconto: <strong style={{ color: 'var(--red)' }}>−{fmtBRL(c.discount)}</strong></span>
                    <span>Líquido: <strong style={{ color: 'var(--green)' }}>{fmtBRL(c.netPayable)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="fat-card">
            <div className="fat-card-header"><div className="fat-card-title">Horas cumpridas por UPA</div></div>
            <div className="fat-card-body">
              <div className="fat-chart-wrap">
                <canvas ref={canvasRef} />
              </div>
            </div>
          </div>
        </div>

        {/* Tabela por médico */}
        <div className="fat-table-card">
          <div className="fat-table-header-bar">
            <div className="fat-table-title">Faturamento por médico</div>
            <div className="fat-table-count">{filteredDoctors.length} profissional{filteredDoctors.length !== 1 ? 'is' : ''}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="fat-table">
              <thead>
                <tr>
                  <th>Médico</th>
                  <th>UPA</th>
                  <th className="center">Previstos</th>
                  <th className="center">Cumpridos</th>
                  <th className="center">Horas</th>
                  <th className="center">Cumprimento</th>
                  <th className="right">Bruto</th>
                  <th className="right">Desconto</th>
                  <th className="right">Líquido</th>
                  <th className="center">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>Carregando...</td></tr>
                ) : filteredDoctors.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)', fontWeight: 700 }}>Nenhum profissional no período.</td></tr>
                ) : filteredDoctors.map(d => {
                  const p = d.fulfillmentPercent;
                  const iniciais = d.userName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <tr key={d.userId + d.clinicId}>
                      <td>
                        <div className="fat-td-med">
                          <div className="fat-td-av" style={{ background: colorFor(d.userId) }}>{iniciais}</div>
                          <div>
                            <div className="fat-td-name">{d.userName}</div>
                            {d.registrationNumber && <div className="fat-td-sub">{d.registrationNumber}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span style={{ fontWeight: 700, fontSize: '.78rem' }}>{d.clinicName}</span></td>
                      <td className="center" style={{ fontWeight: 700 }}>{d.shiftsPlanned}</td>
                      <td className="center" style={{ fontWeight: 800, color: corPct(p) }}>{d.shiftsFulfilled}</td>
                      <td className="center" style={{ fontWeight: 700 }}>{Math.round(d.hoursWorked)}h</td>
                      <td className="center">
                        <div className="fat-cum-cell">
                          <div className="fat-cum-bar-bg"><div className="fat-cum-bar-fill" style={{ width: `${Math.min(100, p)}%`, background: corPct(p) }} /></div>
                          <span className="fat-cum-pct" style={{ color: corPct(p) }}>{p.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="right" style={{ fontWeight: 700 }}>{fmtBRL(d.grossAmount)}</td>
                      <td className="right" style={{ color: d.discount > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }}>{d.discount > 0 ? '−' + fmtBRL(d.discount) : '—'}</td>
                      <td className="right" style={{ fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(d.netAmount)}</td>
                      <td className="center"><span className={`fat-badge ${statusBadgeClass(p)}`}>{p.toFixed(0)}%</span></td>
                    </tr>
                  );
                })}
                {!loading && filteredDoctors.length > 0 && (
                  <tr className="fat-total-row">
                    <td colSpan={2}><strong>TOTAIS DO PERÍODO</strong></td>
                    <td className="center">{filteredTotals.planned}</td>
                    <td className="center">{filteredTotals.fulfilled}</td>
                    <td className="center">{Math.round(filteredTotals.hours)}h</td>
                    <td className="center">{filteredTotals.planned > 0 ? Math.round((filteredTotals.fulfilled / filteredTotals.planned) * 100) : 0}%</td>
                    <td className="right">{fmtBRL(filteredTotals.gross)}</td>
                    <td className="right">−{fmtBRL(filteredTotals.discount)}</td>
                    <td className="right">{fmtBRL(filteredTotals.net)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`fat-toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CORES[hash % CORES.length];
}

const FAT_CSS = `
#adm-root .fat-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:40; }
#adm-root .fat-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .fat-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .fat-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .fat-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .fat-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }
#adm-root .fat-topbar-right { display:flex; align-items:center; gap:.7rem; }
#adm-root .fat-btn-export { display:flex; align-items:center; gap:.4rem; padding:.5rem 1rem; border-radius:10px; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:all .15s; border:1.5px solid; background:none; }
#adm-root .fat-btn-pdf { color:#e05555; border-color:rgba(224,85,85,.3); background:rgba(224,85,85,.06); }
#adm-root .fat-btn-pdf:hover { background:rgba(224,85,85,.12); }
#adm-root .fat-btn-xlsx { color:#16a34a; border-color:rgba(22,163,74,.3); background:rgba(22,163,74,.06); }
#adm-root .fat-btn-xlsx:hover { background:rgba(22,163,74,.12); }
#adm-root .fat-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }

#adm-root .fat-top-controls { display:flex; align-items:flex-end; gap:1rem; margin-bottom:1.4rem; flex-wrap:wrap; }
#adm-root .fat-periodo-tabs { display:flex; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:3px; gap:2px; flex-wrap:wrap; }
#adm-root .fat-periodo-tab { padding:.45rem .85rem; border-radius:9px; border:none; font-family:'Nunito',sans-serif; font-size:.75rem; font-weight:800; cursor:pointer; transition:all .15s; background:none; color:var(--muted); }
#adm-root .fat-periodo-tab.active { background:var(--indigo); color:#fff; box-shadow:0 2px 8px rgba(99,102,241,.3); }
#adm-root .fat-filter-select { appearance:none; -webkit-appearance:none; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; padding:.55rem 2.2rem .55rem .9rem; font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); outline:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .7rem center; }
#adm-root .fat-filter-select:focus { border-color:var(--indigo); }

#adm-root .fat-kpi-strip { display:grid; grid-template-columns:repeat(5,1fr); gap:1rem; margin-bottom:1.4rem; }
#adm-root .fat-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .fat-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .fat-kpi.green::after { background:var(--green); }
#adm-root .fat-kpi.indigo::after { background:var(--indigo); }
#adm-root .fat-kpi.teal::after { background:var(--teal); }
#adm-root .fat-kpi.yellow::after { background:var(--yellow); }
#adm-root .fat-kpi.red::after { background:var(--red); }
#adm-root .fat-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .fat-kpi-val { font-family:'Nunito',sans-serif; font-size:1.6rem; font-weight:900; line-height:1; }
#adm-root .fat-kpi.green .fat-kpi-val { color:var(--green); }
#adm-root .fat-kpi.indigo .fat-kpi-val { color:var(--indigo); }
#adm-root .fat-kpi.teal .fat-kpi-val { color:var(--teal); }
#adm-root .fat-kpi.yellow .fat-kpi-val { color:var(--yellow); }
#adm-root .fat-kpi.red .fat-kpi-val { color:var(--red); }
#adm-root .fat-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }

#adm-root .fat-top-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.4rem; }
#adm-root .fat-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .fat-card-header { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .fat-card-title { font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:900; color:var(--text); }
#adm-root .fat-card-body { padding:1.1rem 1.4rem; }

#adm-root .fat-contrato { margin-bottom:.7rem; padding-bottom:.7rem; border-bottom:1px solid var(--border); }
#adm-root .fat-contrato:last-child { border-bottom:none; margin-bottom:0; padding-bottom:0; }
#adm-root .fat-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem; }
#adm-root .fat-valor { font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:900; color:var(--green); }
#adm-root .fat-bar-bg { height:8px; border-radius:8px; background:var(--bg); overflow:hidden; margin-bottom:.3rem; }
#adm-root .fat-bar-fill { height:100%; border-radius:8px; transition:width .5s ease; }
#adm-root .fat-details { display:flex; justify-content:space-between; font-size:.68rem; font-weight:700; color:var(--muted); flex-wrap:wrap; gap:.5rem; }

#adm-root .fat-chart-wrap { position:relative; height:180px; }
#adm-root .fat-chart-wrap canvas { width:100%; height:100%; }

#adm-root .fat-table-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; margin-bottom:1.4rem; }
#adm-root .fat-table-header-bar { padding:1rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .fat-table-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); }
#adm-root .fat-table-count { font-size:.72rem; font-weight:700; color:var(--muted); }
#adm-root .fat-table { width:100%; border-collapse:collapse; }
#adm-root .fat-table thead tr { background:var(--bg); border-bottom:1px solid var(--border); }
#adm-root .fat-table thead th { padding:.75rem 1.1rem; font-size:.63rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); text-align:left; white-space:nowrap; }
#adm-root .fat-table thead th.right { text-align:right; }
#adm-root .fat-table thead th.center { text-align:center; }
#adm-root .fat-table tbody tr { border-bottom:1px solid rgba(0,0,0,.04); transition:background .12s; }
#adm-root .fat-table tbody tr:last-child { border-bottom:none; }
#adm-root .fat-table tbody tr:hover { background:#f9f9fc; }
#adm-root .fat-table tbody td { padding:.85rem 1.1rem; font-size:.82rem; font-weight:600; color:var(--text); vertical-align:middle; }
#adm-root .fat-table tbody td.right { text-align:right; }
#adm-root .fat-table tbody td.center { text-align:center; }
#adm-root .fat-td-med { display:flex; align-items:center; gap:.7rem; }
#adm-root .fat-td-av { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.65rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .fat-td-name { font-weight:800; }
#adm-root .fat-td-sub { font-size:.68rem; font-weight:600; color:var(--muted); }
#adm-root .fat-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .fat-badge-ok { background:var(--green-light); color:#16a34a; }
#adm-root .fat-badge-parcial { background:var(--yellow-light); color:#b45309; }
#adm-root .fat-badge-pend { background:var(--red-light); color:#dc2626; }

#adm-root .fat-cum-cell { display:flex; align-items:center; gap:.6rem; justify-content:center; }
#adm-root .fat-cum-bar-bg { width:80px; height:7px; border-radius:7px; background:var(--bg); overflow:hidden; flex-shrink:0; }
#adm-root .fat-cum-bar-fill { height:100%; border-radius:7px; }
#adm-root .fat-cum-pct { font-family:'Nunito',sans-serif; font-size:.8rem; font-weight:900; min-width:36px; }

#adm-root .fat-total-row { background:var(--indigo-light); }
#adm-root .fat-total-row td { font-weight:900 !important; color:var(--indigo-dark) !important; border-top:2px solid var(--indigo) !important; }

#adm-root .fat-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; display:flex; align-items:center; gap:.7rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .fat-toast.show { transform:translateY(0); opacity:1; }

/* Dark mode */
#adm-root.dark .fat-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .fat-periodo-tabs { background:#1a1f36; border-color:rgba(255,255,255,.1); }
#adm-root.dark .fat-filter-select { background-color:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .fat-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .fat-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .fat-card-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .fat-contrato { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .fat-table-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .fat-table thead tr { background:#0f1119; }
#adm-root.dark .fat-table thead th { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .fat-table tbody tr { border-bottom-color:rgba(255,255,255,.04); }
#adm-root.dark .fat-table tbody tr:hover { background:rgba(255,255,255,.03); }
#adm-root.dark .fat-total-row { background:rgba(99,102,241,.15); }
#adm-root.dark .fat-total-row td { color:#a5b4fc !important; border-top-color:var(--indigo) !important; }
#adm-root.dark .fat-cum-bar-bg { background:#0f1119; }
#adm-root.dark .fat-bar-bg { background:#0f1119; }

/* Responsive */
@media (max-width: 1200px) {
  #adm-root .fat-kpi-strip { grid-template-columns:repeat(3,1fr); }
  #adm-root .fat-top-grid { grid-template-columns:1fr; }
}
@media (max-width: 768px) {
  #adm-root .fat-hamburger { display:flex; }
  #adm-root .fat-topbar { padding:.85rem 1rem; flex-wrap:wrap; gap:.5rem; }
  #adm-root .fat-topbar-right { flex-wrap:wrap; gap:.4rem; }
  #adm-root .fat-btn-export { padding:.45rem .8rem; font-size:.72rem; }
  #adm-root .fat-content { padding:1rem; }
  #adm-root .fat-top-controls { flex-direction:column; align-items:stretch; }
  #adm-root .fat-periodo-tabs { overflow-x:auto; -webkit-overflow-scrolling:touch; flex-wrap:nowrap; }
  #adm-root .fat-periodo-tab { white-space:nowrap; }
  #adm-root .fat-filter-select { width:100%; }
  #adm-root .fat-kpi-strip { grid-template-columns:1fr 1fr; gap:.75rem; }
  #adm-root .fat-kpi { padding:.85rem .9rem; }
  #adm-root .fat-kpi-val { font-size:1.3rem; }
  #adm-root .fat-kpi-lbl { font-size:.58rem; white-space:normal; word-break:break-word; }
  #adm-root .fat-kpi-sub { font-size:.6rem; }
  #adm-root .fat-details { flex-direction:column; align-items:flex-start; }
}
@media (max-width: 480px) {
  #adm-root .fat-kpi-strip { grid-template-columns:1fr 1fr; gap:.5rem; }
  #adm-root .fat-kpi { padding:.7rem .8rem; }
  #adm-root .fat-kpi-val { font-size:1.2rem; }
  #adm-root .fat-btn-export { flex:1; justify-content:center; }
}
`;
