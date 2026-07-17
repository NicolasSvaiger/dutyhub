/**
 * Admin OS — Disponibilidade dos Médicos.
 * Grid de profissionais com mini-calendário mensal + drawer para registrar
 * restrições (férias, licença, afastamento, turno, dias específicos).
 * Replica o mock em /originais/OS/admin-disponibilidade.html com dados reais.
 */
import { useState, useEffect, useMemo } from 'react';
import { availabilityApi } from '../../api/availabilityApi';
import type {
  ProfessionalAvailability,
  AvailabilityRestrictionType,
} from '../../api/availabilityApi';

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

const AVATAR_COLORS = ['#6366f1', '#2DBFB8', '#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444', '#0f766e', '#7c3aed', '#be185d', '#b45309'];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function colorFor(id: string): string {
  return AVATAR_COLORS[Math.abs(hashCode(id)) % AVATAR_COLORS.length];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtRestrictionPeriod(r: {
  type: AvailabilityRestrictionType;
  startDate: string;
  endDate: string;
  blockedShiftsMask?: number | null;
  blockedWeekdaysMask?: number | null;
}): string {
  if (r.type === 'RestricaoTurno' && r.blockedShiftsMask != null) {
    const turnos = ['Manhã', 'Tarde', 'Noite'].filter((_, i) => (r.blockedShiftsMask! & (1 << i)) !== 0);
    return `Não disponível ${turnos.join('/').toLowerCase()}`;
  }
  if (r.type === 'DiasEspecificos' && r.blockedWeekdaysMask != null) {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].filter((_, i) => (r.blockedWeekdaysMask! & (1 << i)) !== 0);
    return dias.length ? `${dias.join(', ')} (recorrente)` : 'Recorrente';
  }
  return `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`;
}

const STATUS_TO_BADGE_CLASS: Record<string, string> = {
  Disponivel: 'disp-badge-disponivel',
  Ferias: 'disp-badge-ferias',
  Licenca: 'disp-badge-licenca',
  Afastado: 'disp-badge-afastado',
  Restricao: 'disp-badge-restricao',
};

/** Retorna a classe da célula do calendário para uma data específica. */
function cellClassForDate(
  date: Date,
  restrictions: ProfessionalAvailability['restrictions'],
): string {
  // Cheia (Ferias/Licenca/Afastamento) tem prioridade.
  const inRange = (start: string, end: string) => {
    const d = date.getTime();
    return d >= new Date(start).getTime() && d <= new Date(end).getTime();
  };

  const activeFull = restrictions.find(r =>
    (r.type === 'Ferias' || r.type === 'LicencaMedica' || r.type === 'AfastamentoAdministrativo')
    && inRange(r.startDate, r.endDate),
  );
  if (activeFull) {
    if (activeFull.type === 'Ferias') return 'ferias';
    if (activeFull.type === 'LicencaMedica') return 'licenca';
    return 'afastamento';
  }

  const activeRecurring = restrictions.find(r =>
    (r.type === 'RestricaoTurno' || r.type === 'DiasEspecificos')
    && inRange(r.startDate, r.endDate)
    && (r.type === 'RestricaoTurno' || ((r.blockedWeekdaysMask ?? 0) & (1 << date.getDay())) !== 0),
  );
  if (activeRecurring) return 'restricao';

  return 'livre';
}

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function AdminDisponibilidade({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const [data, setData] = useState<ProfessionalAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fUserId, setFUserId] = useState('');
  const [fType, setFType] = useState<AvailabilityRestrictionType | ''>('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fShiftsMask, setFShiftsMask] = useState(0);
  const [fWeekdaysMask, setFWeekdaysMask] = useState(0);
  const [fNotes, setFNotes] = useState('');

  useEffect(() => {
    availabilityApi.getAll()
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const monthLabel = `${MESES_PT[now.getMonth()]} ${now.getFullYear()}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();

  const formValid = useMemo(() => {
    if (!fUserId || !fType) return false;
    if (fType === 'RestricaoTurno') return fShiftsMask !== 0;
    if (fType === 'DiasEspecificos') return fWeekdaysMask !== 0;
    return !!fStart && !!fEnd && new Date(fEnd) >= new Date(fStart);
  }, [fUserId, fType, fStart, fEnd, fShiftsMask, fWeekdaysMask]);

  function showToast(msg: string, error = false) {
    setToast(msg);
    setToastError(error);
    setTimeout(() => setToast(''), 3500);
  }

  function openDrawer(userIdInitial = '') {
    setFUserId(userIdInitial);
    setFType('');
    setFStart('');
    setFEnd('');
    setFShiftsMask(0);
    setFWeekdaysMask(0);
    setFNotes('');
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function salvar() {
    if (!formValid || fType === '') return;
    setSaving(true);
    try {
      // Para restrições recorrentes (turno/dias), usamos um range longo por padrão
      // se o admin não informou datas — 1 ano.
      const startDate = fStart || new Date().toISOString().slice(0, 10);
      const endDate = fEnd || new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()).toISOString().slice(0, 10);

      await availabilityApi.createRestriction({
        userId: fUserId,
        type: fType,
        startDate,
        endDate,
        blockedShiftsMask: fType === 'RestricaoTurno' ? fShiftsMask : null,
        blockedWeekdaysMask: fType === 'DiasEspecificos' ? fWeekdaysMask : null,
        notes: fNotes || null,
      });

      // Reload
      const refreshed = await availabilityApi.getAll();
      setData(Array.isArray(refreshed) ? refreshed : []);

      closeDrawer();
      showToast('Restrição registrada! O médico será bloqueado nas datas indicadas.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(msg || 'Erro ao registrar restrição.', true);
    } finally {
      setSaving(false);
    }
  }

  async function removerRestricao(id: string) {
    try {
      await availabilityApi.deleteRestriction(id);
      const refreshed = await availabilityApi.getAll();
      setData(Array.isArray(refreshed) ? refreshed : []);
      showToast('Restrição removida.');
    } catch {
      showToast('Erro ao remover restrição.', true);
    }
  }

  function toggleBit(mask: number, bit: number): number {
    return mask ^ (1 << bit);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="disp-topbar">
        <div className="disp-topbar-left">
          <button className="disp-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div>
            <div className="disp-topbar-title">Disponibilidade dos Médicos</div>
            <div className="disp-topbar-sub">Férias, licenças, afastamentos e restrições de turno</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
        </button>
      </div>

      <div className="disp-content">
        <div className="disp-page-header">
          <div>
            <div className="disp-page-title">Controle de Disponibilidade</div>
            <div className="disp-page-sub">Períodos indisponíveis bloqueiam a escalação automaticamente</div>
          </div>
          <button className="disp-btn-novo" onClick={() => openDrawer()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Registrar restrição
          </button>
        </div>

        <div className="disp-aviso">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          <div className="disp-aviso-text">
            Os períodos marcados como <strong>férias, licença ou afastamento</strong> bloqueiam automaticamente a escalação do médico naquelas datas. O sistema alertará o coordenador caso tente escalar um profissional indisponível.
          </div>
        </div>

        {loading ? (
          <div className="disp-loading">Carregando disponibilidade…</div>
        ) : data.length === 0 ? (
          <div className="disp-empty">Nenhum profissional cadastrado.</div>
        ) : (
          <div className="disp-medicos-grid">
            {data.map(p => (
              <div className="disp-med-card" key={p.userId}>
                <div className="disp-med-card-header">
                  <div className="disp-med-card-av" style={{ background: colorFor(p.userId) }}>{initials(p.userName)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="disp-med-card-name">{p.userName}</div>
                    <div className="disp-med-card-crm">{p.registrationNumber || '—'}</div>
                  </div>
                  <span className={`disp-badge ${STATUS_TO_BADGE_CLASS[p.status] ?? 'disp-badge-disponivel'}`}>{p.statusLabel}</span>
                </div>

                <div className="disp-body">
                  <div className="disp-mes-label">{monthLabel}</div>
                  <div className="disp-mini-cal">
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const date = new Date(now.getFullYear(), now.getMonth(), day);
                      const cls = cellClassForDate(date, p.restrictions);
                      const isToday = day === today;
                      return (
                        <div key={day} className={`disp-cal-cell ${cls} ${isToday ? 'hoje' : ''}`} title={`Dia ${day}`}>
                          {day}
                        </div>
                      );
                    })}
                  </div>

                  <div className="disp-restricoes-list">
                    {p.restrictions.length === 0 ? (
                      <div className="disp-restricao-vazia">Sem restrições cadastradas</div>
                    ) : (
                      p.restrictions.map(r => (
                        <div className="disp-restricao-item" key={r.id}>
                          <span className="disp-restricao-tipo">{r.typeLabel}</span>
                          <span className="disp-restricao-periodo">{fmtRestrictionPeriod(r)}</span>
                          <button className="disp-restricao-del" title="Remover" onClick={() => removerRestricao(r.id)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="disp-med-card-footer">
                  <button className="disp-btn-edit" onClick={() => openDrawer(p.userId)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Adicionar restrição
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && <div className="disp-overlay" onClick={closeDrawer} />}
      <div className={`disp-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="disp-drawer-header">
          <div className="disp-drawer-title">Registrar restrição de disponibilidade</div>
          <button className="disp-drawer-close" onClick={closeDrawer} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="disp-drawer-body">
          <div className="disp-form-section">
            <div className="disp-form-section-title">Médico</div>
            <div className="disp-field">
              <label>Selecione o profissional *</label>
              <select value={fUserId} onChange={e => setFUserId(e.target.value)}>
                <option value="">Selecione...</option>
                {data.map(p => (
                  <option key={p.userId} value={p.userId}>
                    {p.userName}{p.registrationNumber ? ` – ${p.registrationNumber}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="disp-form-section">
            <div className="disp-form-section-title">Tipo de restrição</div>
            <div className="disp-field">
              <label>Tipo *</label>
              <select value={fType} onChange={e => setFType(e.target.value as AvailabilityRestrictionType | '')}>
                <option value="">Selecione...</option>
                <option value="Ferias">🏖 Férias</option>
                <option value="LicencaMedica">🏥 Licença médica</option>
                <option value="AfastamentoAdministrativo">📋 Afastamento administrativo</option>
                <option value="RestricaoTurno">⏰ Restrição de turno</option>
                <option value="DiasEspecificos">📅 Dias específicos indisponíveis</option>
              </select>
            </div>

            <div className="disp-form-row" style={{ marginTop: '.9rem' }}>
              <div className="disp-field">
                <label>Data início {fType !== 'RestricaoTurno' && fType !== 'DiasEspecificos' && '*'}</label>
                <input type="date" value={fStart} onChange={e => setFStart(e.target.value)} />
              </div>
              <div className="disp-field">
                <label>Data fim {fType !== 'RestricaoTurno' && fType !== 'DiasEspecificos' && '*'}</label>
                <input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)} />
              </div>
            </div>

            {fType === 'RestricaoTurno' && (
              <div style={{ marginTop: '.9rem' }}>
                <label className="disp-inline-label">Turnos indisponíveis *</label>
                <div className="disp-btn-row">
                  {['Manhã', 'Tarde', 'Noite'].map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      className={`disp-tag-btn ${(fShiftsMask & (1 << i)) ? 'active' : ''}`}
                      onClick={() => setFShiftsMask(m => toggleBit(m, i))}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}

            {fType === 'DiasEspecificos' && (
              <div style={{ marginTop: '.9rem' }}>
                <label className="disp-inline-label">Dias da semana indisponíveis *</label>
                <div className="disp-btn-row">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      className={`disp-tag-btn ${(fWeekdaysMask & (1 << i)) ? 'active' : ''}`}
                      onClick={() => setFWeekdaysMask(m => toggleBit(m, i))}
                    >{d}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="disp-field" style={{ marginTop: '.9rem' }}>
              <label>Observação / Documento</label>
              <textarea placeholder="Número do atestado, processo, ou outras observações..." value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} />
              <div className="disp-field-hint">Opcional. Fica no histórico do médico.</div>
            </div>
          </div>
        </div>
        <div className="disp-drawer-footer">
          <button className="disp-btn-cancelar" onClick={closeDrawer}>Cancelar</button>
          <button className="disp-btn-salvar" onClick={salvar} disabled={!formValid || saving}>
            {saving ? 'Salvando…' : 'Salvar restrição'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`disp-toast ${toastError ? 'error' : ''}`}>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}

const CSS = `
#adm-root .disp-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .disp-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .disp-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .disp-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .disp-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .disp-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }

#adm-root .disp-content { flex:1; padding:2rem; overflow-y:auto; animation:disp-fadeUp .35s ease; }
@keyframes disp-fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

#adm-root .disp-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .disp-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .disp-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }

#adm-root .disp-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s; }
#adm-root .disp-btn-novo:hover { transform:translateY(-1px); }

#adm-root .disp-aviso { background:var(--indigo-light); border:1.5px solid rgba(99,102,241,.2); border-radius:16px; padding:1rem 1.4rem; margin-bottom:1.4rem; display:flex; align-items:center; gap:.8rem; color:var(--indigo); }
#adm-root .disp-aviso-text { font-size:.82rem; font-weight:700; color:var(--indigo-dark); line-height:1.5; }

#adm-root .disp-loading, #adm-root .disp-empty { text-align:center; padding:3rem; color:var(--muted); font-weight:700; font-size:.9rem; background:var(--surface); border-radius:16px; border:1.5px dashed var(--border); }

#adm-root .disp-medicos-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:1.2rem; }

#adm-root .disp-med-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; transition:transform .15s,box-shadow .15s; }
#adm-root .disp-med-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(99,102,241,.1); }
#adm-root .disp-med-card-header { padding:1rem 1.2rem; display:flex; align-items:center; gap:.8rem; border-bottom:1px solid var(--border); }
#adm-root .disp-med-card-av { width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.78rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .disp-med-card-name { font-family:'Nunito',sans-serif; font-size:.92rem; font-weight:900; color:var(--text); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#adm-root .disp-med-card-crm { font-size:.68rem; font-weight:600; color:var(--muted); }

#adm-root .disp-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .disp-badge-disponivel { background:var(--green-light); color:#16a34a; }
#adm-root .disp-badge-ferias { background:var(--blue-light); color:var(--blue); }
#adm-root .disp-badge-licenca { background:var(--purple-light); color:var(--purple); }
#adm-root .disp-badge-restricao { background:var(--yellow-light); color:#b45309; }
#adm-root .disp-badge-afastado { background:var(--red-light); color:#dc2626; }

#adm-root .disp-body { padding:1rem 1.2rem; }
#adm-root .disp-mes-label { font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:.6rem; }
#adm-root .disp-mini-cal { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin-bottom:.9rem; }
#adm-root .disp-cal-cell { height:20px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:.55rem; font-weight:800; }
#adm-root .disp-cal-cell.livre { background:var(--green-light); color:#16a34a; }
#adm-root .disp-cal-cell.ferias { background:var(--blue-light); color:var(--blue); }
#adm-root .disp-cal-cell.licenca { background:var(--purple-light); color:var(--purple); }
#adm-root .disp-cal-cell.afastamento { background:var(--red-light); color:#dc2626; }
#adm-root .disp-cal-cell.restricao { background:var(--yellow-light); color:#b45309; }
#adm-root .disp-cal-cell.hoje { border:2px solid var(--indigo); }

#adm-root .disp-restricoes-list { display:flex; flex-direction:column; gap:.4rem; }
#adm-root .disp-restricao-item { display:flex; align-items:center; gap:.6rem; padding:.4rem .6rem; background:var(--bg); border-radius:8px; font-size:.72rem; }
#adm-root .disp-restricao-tipo { font-weight:800; color:var(--text); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#adm-root .disp-restricao-periodo { font-weight:600; color:var(--muted); }
#adm-root .disp-restricao-del { background:none; border:none; cursor:pointer; color:var(--muted); padding:2px; line-height:0; transition:color .15s; }
#adm-root .disp-restricao-del:hover { color:var(--red); }
#adm-root .disp-restricao-vazia { font-size:.72rem; color:var(--muted); font-weight:600; text-align:center; padding:.5rem; }

#adm-root .disp-med-card-footer { padding:.7rem 1.2rem; border-top:1px solid var(--border); display:flex; justify-content:flex-end; }
#adm-root .disp-btn-edit { display:flex; align-items:center; gap:.35rem; padding:.35rem .8rem; border:1.5px solid var(--border); border-radius:8px; background:none; font-family:'Nunito',sans-serif; font-size:.72rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .disp-btn-edit:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }

/* Drawer */
#adm-root .disp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; }
#adm-root .disp-drawer { position:fixed; top:0; right:0; bottom:0; width:500px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .disp-drawer.open { transform:translateX(0); }
#adm-root .disp-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .disp-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .disp-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .disp-drawer-close:hover { color:var(--text); }
#adm-root .disp-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .disp-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; flex-shrink:0; }
#adm-root .disp-form-section { margin-bottom:1.4rem; }
#adm-root .disp-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--indigo); margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid var(--indigo-light); }
#adm-root .disp-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; }
#adm-root .disp-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .disp-field label, #adm-root .disp-inline-label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); display:block; margin-bottom:.5rem; }
#adm-root .disp-field input, #adm-root .disp-field select, #adm-root .disp-field textarea { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .disp-field input:focus, #adm-root .disp-field select:focus, #adm-root .disp-field textarea:focus { border-color:var(--indigo); background:#fff; }
#adm-root .disp-field select { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right .8rem center; background-color:var(--bg); cursor:pointer; }
#adm-root .disp-field textarea { resize:vertical; min-height:60px; }
#adm-root .disp-field-hint { font-size:.65rem; font-weight:600; color:var(--muted); margin-top:2px; }
#adm-root .disp-btn-row { display:flex; gap:.4rem; flex-wrap:wrap; }
#adm-root .disp-tag-btn { padding:.4rem .8rem; border:1.5px solid var(--border); border-radius:8px; background:none; font-family:'Nunito',sans-serif; font-size:.75rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .disp-tag-btn.active { background:var(--indigo); border-color:var(--indigo); color:#fff; }
#adm-root .disp-tag-btn:hover:not(.active) { border-color:var(--indigo); color:var(--indigo); }

#adm-root .disp-btn-salvar { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); box-shadow:0 3px 12px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .disp-btn-salvar:hover:not(:disabled) { transform:translateY(-1px); }
#adm-root .disp-btn-salvar:disabled { opacity:.5; cursor:not-allowed; }
#adm-root .disp-btn-cancelar { padding:.85rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; transition:border-color .15s; }
#adm-root .disp-btn-cancelar:hover { border-color:var(--indigo); color:var(--indigo); }

#adm-root .disp-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); z-index:200; }
#adm-root .disp-toast.error { background:var(--red); }

/* Dark mode */
#adm-root.dark .disp-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .disp-med-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .disp-restricao-item { background:#0f1119; }
#adm-root.dark .disp-loading, #adm-root.dark .disp-empty { background:#1a1f36; }
#adm-root.dark .disp-drawer { background:#1a1f36; }
#adm-root.dark .disp-drawer-header, #adm-root.dark .disp-drawer-footer { border-color:rgba(255,255,255,.06); }
#adm-root.dark .disp-field input, #adm-root.dark .disp-field select, #adm-root.dark .disp-field textarea { background:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }

/* Responsive */
@media (max-width: 768px) {
  #adm-root .disp-hamburger { display:flex; }
  #adm-root .disp-topbar { padding:.85rem 1rem; }
  #adm-root .disp-topbar-title { font-size:.9rem; line-height:1.2; }
  #adm-root .disp-topbar-sub { font-size:.62rem; }
  #adm-root .disp-content { padding:1rem; }
  #adm-root .disp-page-header { flex-direction:column; align-items:stretch; }
  #adm-root .disp-btn-novo { justify-content:center; }
  #adm-root .disp-medicos-grid { grid-template-columns:1fr; }
  #adm-root .disp-drawer { width:100vw; }
  #adm-root .disp-form-row { grid-template-columns:1fr; }
}
`;
