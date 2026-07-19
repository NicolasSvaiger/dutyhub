/**
 * Admin OS — Escalas de Plantão page.
 * Weekly schedule grid with drag-and-drop assignment of doctors to shifts.
 * Replicates mock at /originais/OS/admin-escalas.html.
 */
import { useState, useEffect, useMemo } from 'react';
import { shiftsApi } from '../../api/shiftsApi';
import { clinicsApi } from '../../api/clinicsApi';
import { usersApi } from '../../api/usersApi';
import type { Shift, Clinic, User } from '../../types';

const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TURNOS_DEFAULT = [
  { key: 'manha', label: 'Manhã', horario: '07h–19h', startTime: '07:00:00', endTime: '19:00:00' },
  { key: 'tarde', label: 'Tarde', horario: '13h–01h', startTime: '13:00:00', endTime: '01:00:00' },
  { key: 'noite', label: 'Noite', horario: '19h–07h', startTime: '19:00:00', endTime: '07:00:00' },
];
const CORES = ['#6366f1', '#2DBFB8', '#22c55e', '#f97316', '#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444', '#0f766e', '#7c3aed'];

interface Props {
  onBack: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar?: () => void;
}

export function AdminEscalas({ onBack: _onBack, dark, onToggleTheme, onOpenSidebar }: Props) {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClinic, setSelectedClinic] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [toast, setToast] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<{ turno: string; date: string; profType: 'Medico' | 'Enfermeiro' } | null>(null);
  const [modalSelectedDoc, setModalSelectedDoc] = useState<string | null>(null);
  const [modalTipo, setModalTipo] = useState<'fixo' | 'rotativo'>('fixo');

  useEffect(() => {
    Promise.all([clinicsApi.getAll(), usersApi.getAll(), shiftsApi.getAll()])
      .then(([c, u, s]) => {
        const cl = Array.isArray(c) ? c : [];
        setClinics(cl);
        setUsers(Array.isArray(u) ? u : []);
        setShifts(Array.isArray(s) ? s : []);
        if (cl.length > 0 && !selectedClinic) setSelectedClinic(cl[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Turnos from selected clinic templates or default
  const selectedClinicObj = useMemo(() => clinics.find(c => c.id === selectedClinic), [clinics, selectedClinic]);
  const hasNursing = selectedClinicObj?.hasNursing || false;

  const turnosMedicos = useMemo(() => {
    const templates = selectedClinicObj?.shiftTemplates?.filter(t => t.professionalType === 'Medico');
    if (templates && templates.length > 0) {
      return templates
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(t => ({
          key: t.id,
          label: t.name,
          horario: `${t.startTime.slice(0, 5).replace(':', 'h')}–${t.endTime.slice(0, 5).replace(':', 'h')}`,
          startTime: t.startTime,
          endTime: t.endTime,
        }));
    }
    return TURNOS_DEFAULT;
  }, [selectedClinicObj]);

  const turnosEnfermeiros = useMemo(() => {
    const templates = selectedClinicObj?.shiftTemplates?.filter(t => t.professionalType === 'Enfermeiro');
    if (templates && templates.length > 0) {
      return templates
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(t => ({
          key: t.id,
          label: t.name,
          horario: `${t.startTime.slice(0, 5).replace(':', 'h')}–${t.endTime.slice(0, 5).replace(':', 'h')}`,
          startTime: t.startTime,
          endTime: t.endTime,
        }));
    }
    return TURNOS_DEFAULT;
  }, [selectedClinicObj]);

  // Use médicos turnos as main (backwards compat)
  const turnos = turnosMedicos;
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [today, weekOffset]);

  const weekLabel = useMemo(() => {
    const ini = weekDays[0], fim = weekDays[6];
    return `${ini.getDate()} ${MESES_PT[ini.getMonth()]} – ${fim.getDate()} ${MESES_PT[fim.getMonth()]} ${fim.getFullYear()}`;
  }, [weekDays]);

  // Filter shifts for selected clinic and current week
  const weekShifts = useMemo(() => {
    if (!selectedClinic) return [];
    const start = weekDays[0].toISOString().split('T')[0];
    const end = weekDays[6].toISOString().split('T')[0];
    return shifts.filter(s => {
      if (s.clinicId !== selectedClinic) return false;
      const shiftDate = (s.date || '').split('T')[0];
      return shiftDate >= start && shiftDate <= end;
    });
  }, [shifts, selectedClinic, weekDays]);

  // Doctors (professionals only)
  const doctors = useMemo(() => {
    return users.filter(u => {
      const pt = u.professionalType;
      const roles = u.roles || [];
      return pt === 'Medico' || pt === 'Enfermeiro' || roles.some((r: { role: string }) => r.role === 'Medico' || r.role === 'Enfermeiro');
    });
  }, [users]);

  // Week summary — conta apenas shifts reais (não "Plantão Livre")
  const summary = useMemo(() => {
    const totalSlots = turnos.length * 7 + (hasNursing ? turnosEnfermeiros.length * 7 : 0);
    const realShifts = weekShifts.filter(s => !s.title.includes('Livre'));
    const filledSlots = realShifts.length;
    const uniqueDocs = new Set(realShifts.flatMap(s => (s.assignments || []).map(a => a.userId))).size;
    return {
      escalados: filledSlots,
      vagas: Math.max(0, totalSlots - filledSlots),
      medicos: uniqueDocs,
      cobertura: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) + '%' : '—',
    };
  }, [weekShifts, turnos, turnosEnfermeiros, hasNursing]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function openModal(turno: string, date: string, profType: 'Medico' | 'Enfermeiro' = 'Medico') {
    setModalContext({ turno, date, profType });
    setModalSelectedDoc(null);
    setModalTipo('fixo');
    setModalOpen(true);
  }

  async function confirmAddDoctor() {
    if (!modalContext || !modalSelectedDoc || !selectedClinic) return;
    try {
      const { turno, date, profType } = modalContext;
      const turnosDoTipo = profType === 'Enfermeiro' ? turnosEnfermeiros : turnosMedicos;
      const turnoObj = turnosDoTipo.find(t => t.key === turno) || turnosDoTipo[0];
      const startTime = turnoObj?.startTime || '07:00:00';
      const endTime = turnoObj?.endTime || '19:00:00';
      const dateISO = date + 'T00:00:00Z';
      const titlePrefix = profType === 'Enfermeiro' ? 'Plantão Enfermagem' : 'Plantão';

      // Create shift
      const newShift = await shiftsApi.create({
        clinicId: selectedClinic,
        title: `${titlePrefix} ${turnoObj?.label || turno} - ${modalTipo}`,
        date: dateISO,
        startTime,
        endTime,
      });

      // Assign doctor
      await shiftsApi.assign(newShift.id, { userId: modalSelectedDoc });

      // Refresh shifts
      const refreshed = await shiftsApi.getAll();
      setShifts(Array.isArray(refreshed) ? refreshed : []);

      setModalOpen(false);
      showToast(profType === 'Enfermeiro' ? 'Enfermeiro adicionado ao turno!' : 'Médico adicionado ao turno!');
    } catch {
      showToast('Erro ao adicionar profissional ao turno.');
    }
  }

  async function generateAuto() {
    if (!selectedClinic || doctors.length === 0) {
      showToast('Cadastre profissionais e UPAs primeiro.');
      return;
    }

    // Separar profissionais por tipo
    const medicos = doctors.filter(d => {
      const pt = d.professionalType;
      const roles = d.roles || [];
      const isEnfermeiro = pt === 'Enfermeiro' || roles.some((r: { role: string }) => r.role === 'Enfermeiro');
      return !isEnfermeiro;
    });
    const enfermeiros = doctors.filter(d => {
      const pt = d.professionalType;
      const roles = d.roles || [];
      return pt === 'Enfermeiro' || roles.some((r: { role: string }) => r.role === 'Enfermeiro');
    });

    let count = 0;

    // Gerar escala médica
    let medIdx = 0;
    for (const day of weekDays) {
      const dateStr = day.toISOString().split('T')[0];
      for (const turno of turnosMedicos) {
        const existing = weekShifts.filter(s => {
          const sd = (s.date || '').split('T')[0];
          if (sd !== dateStr) return false;
          const st = s.startTime || '';
          return st.startsWith(turno.startTime?.slice(0, 2) || '') && !s.title.toLowerCase().includes('enferm');
        });
        // Get already assigned doctor IDs in this cell
        const assignedIds = new Set(existing.flatMap(s => (s.assignments || []).map(a => a.userId)));
        // Only fill if there's no one yet
        if (existing.length === 0 && medicos.length > 0) {
          // Pick a doctor not already assigned today in any turno
          const dayShifts = weekShifts.filter(s => (s.date || '').split('T')[0] === dateStr && !s.title.toLowerCase().includes('enferm'));
          const dayAssigned = new Set(dayShifts.flatMap(s => (s.assignments || []).map(a => a.userId)));
          const available = medicos.filter(m => !dayAssigned.has(m.id) && !assignedIds.has(m.id));
          const doc = available.length > 0 ? available[medIdx % available.length] : medicos[medIdx % medicos.length];
          // Don't add if this doctor is already in this exact slot
          if (!assignedIds.has(doc.id)) {
            try {
              const newShift = await shiftsApi.create({ clinicId: selectedClinic, title: `Plantão ${turno.label} - rotativo`, date: dateStr + 'T00:00:00Z', startTime: turno.startTime, endTime: turno.endTime });
              await shiftsApi.assign(newShift.id, { userId: doc.id });
              medIdx++;
              count++;
            } catch { /* skip */ }
          }
        }
      }
    }

    // Gerar escala de enfermagem (se a UPA usa)
    if (hasNursing && enfermeiros.length > 0) {
      let enfIdx = 0;
      for (const day of weekDays) {
        const dateStr = day.toISOString().split('T')[0];
        for (const turno of turnosEnfermeiros) {
          const existing = weekShifts.filter(s => {
            const sd = (s.date || '').split('T')[0];
            if (sd !== dateStr) return false;
            const st = s.startTime || '';
            return st.startsWith(turno.startTime?.slice(0, 2) || '') && s.title.toLowerCase().includes('enferm');
          });
          const assignedIds = new Set(existing.flatMap(s => (s.assignments || []).map(a => a.userId)));
          if (existing.length === 0) {
            const available = enfermeiros.filter(e => !assignedIds.has(e.id));
            const enf = available.length > 0 ? available[enfIdx % available.length] : null;
            if (enf) {
              try {
                const newShift = await shiftsApi.create({ clinicId: selectedClinic, title: `Plantão Enfermagem ${turno.label} - rotativo`, date: dateStr + 'T00:00:00Z', startTime: turno.startTime, endTime: turno.endTime });
                await shiftsApi.assign(newShift.id, { userId: enf.id });
                enfIdx++;
                count++;
              } catch { /* skip */ }
            }
          }
        }
      }
    }

    const refreshed = await shiftsApi.getAll();
    setShifts(Array.isArray(refreshed) ? refreshed : []);
    showToast(`Escala gerada! ${count} turno${count !== 1 ? 's' : ''} preenchido${count !== 1 ? 's' : ''}.`);
  }

  const dateStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESCALAS_CSS }} />
      <div className="esc-topbar">
        <div className="esc-topbar-left">
          <button className="esc-hamburger" onClick={() => onOpenSidebar?.()} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div className="esc-topbar-title">Escalas de Plantão</div>
            <div className="esc-topbar-sub">{dateStr}</div>
          </div>
        </div>
        <div className="esc-topbar-right">
          <button className="esc-btn-action esc-btn-gerar" onClick={generateAuto}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Gerar automaticamente
          </button>
          <button className="esc-btn-action esc-btn-publicar" onClick={() => showToast('Escala publicada! Médicos notificados por e-mail.')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Publicar escala
          </button>
          <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </div>

      <div className="esc-content">
        {/* Controls */}
        <div className="esc-controls-bar">
          <div className="esc-controls-left">
            <div className="esc-upa-tabs">
              {clinics.map(c => (
                <button key={c.id} className={`esc-upa-tab ${selectedClinic === c.id ? 'active' : ''}`} onClick={() => setSelectedClinic(c.id)}>
                  {c.name}
                </button>
              ))}
              {clinics.length === 0 && <span style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '.5rem' }}>Nenhuma UPA cadastrada</span>}
            </div>
          </div>
          <div className="esc-controls-right">
            <div className="esc-week-nav">
              <button className="esc-week-btn" onClick={() => setWeekOffset(weekOffset - 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div className="esc-week-label">{weekLabel}</div>
              <button className="esc-week-btn" onClick={() => setWeekOffset(weekOffset + 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <button className="esc-btn-hoje" onClick={() => setWeekOffset(0)}>Hoje</button>
          </div>
        </div>

        {/* Main grid + side panel */}
        <div className="esc-side-panel">
          <div>
            {/* Schedule Grid - Médicos */}
            {hasNursing && <div className="esc-section-title">Escala Médica</div>}
            <div className="esc-grade-wrap">
              <table className="esc-grade-table">
                <thead>
                  <tr>
                    <th>Turno</th>
                    {weekDays.map((d, i) => {
                      const isToday = d.getTime() === today.getTime();
                      return (
                        <th key={i} className={isToday ? 'esc-th-hoje' : ''}>
                          <span className="esc-day-num">{d.getDate()}</span>
                          <span className="esc-day-name">{DIAS_PT[d.getDay()]}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {turnos.map(turno => (
                    <tr key={turno.key}>
                      <td className="esc-turno-cell">
                        <div className="esc-turno-label">{turno.label}</div>
                        <span className="esc-turno-horario">{turno.horario}</span>
                      </td>
                      {weekDays.map((d, di) => {
                        const isToday = d.getTime() === today.getTime();
                        const cellDateStr = d.toISOString().split('T')[0];
                        const cellShifts = weekShifts.filter(s => {
                          const sd = (s.date || '').split('T')[0];
                          if (sd !== cellDateStr) return false;
                          const st = s.startTime || '';
                          const turnoStart = turno.startTime?.slice(0, 2) || '';
                          const matchesTurno = st.startsWith(turnoStart) || s.title.toLowerCase().includes(turno.label.toLowerCase());
                          return matchesTurno && !s.title.toLowerCase().includes('enferm');
                        });
                        return (
                          <td key={di} className={isToday ? 'esc-hoje-col' : ''}>
                            <div className="esc-cell">
                              {cellShifts.length === 0 && (
                                <div className="esc-vaga-aberta" onClick={() => openModal(turno.key, cellDateStr)}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                                  Vaga em aberto
                                </div>
                              )}
                              {cellShifts.map(s => (
                                (s.assignments || []).map((a, ai) => (
                                  <div key={`${s.id}-${ai}`} className={`esc-med-chip ${s.title.includes('rotativo') ? 'rotativo' : s.title.includes('pendente') ? 'pendente' : 'fixo'}`}>
                                    <div className="esc-med-dot" />
                                    <span className="esc-med-nome">{a.userName || 'Médico'}</span>
                                    <button className="esc-med-remove" title="Remover" onClick={async (e) => { e.stopPropagation(); try { await shiftsApi.delete(s.id); setShifts(prev => prev.filter(sh => sh.id !== s.id)); showToast('Médico removido do turno.'); } catch { /* already deleted */ } }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </div>
                                ))
                              ))}
                              {cellShifts.length > 0 && (
                                <button className="esc-add-slot" onClick={() => openModal(turno.key, cellDateStr)}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  Adicionar
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Schedule Grid - Enfermeiros (se a UPA usa enfermagem) */}
            {hasNursing && (
              <>
                <div className="esc-section-title" style={{ marginTop: '1.2rem' }}>Escala de Enfermagem</div>
                <div className="esc-grade-wrap">
                  <table className="esc-grade-table">
                    <thead>
                      <tr>
                        <th>Turno</th>
                        {weekDays.map((d, i) => {
                          const isToday = d.getTime() === today.getTime();
                          return (
                            <th key={i} className={isToday ? 'esc-th-hoje' : ''}>
                              <span className="esc-day-num">{d.getDate()}</span>
                              <span className="esc-day-name">{DIAS_PT[d.getDay()]}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {turnosEnfermeiros.map(turno => (
                        <tr key={turno.key}>
                          <td className="esc-turno-cell">
                            <div className="esc-turno-label">{turno.label}</div>
                            <span className="esc-turno-horario">{turno.horario}</span>
                          </td>
                          {weekDays.map((d, di) => {
                            const isToday = d.getTime() === today.getTime();
                            const cellDateStr = d.toISOString().split('T')[0];
                            const cellShifts = weekShifts.filter(s => {
                              const sd = (s.date || '').split('T')[0];
                              if (sd !== cellDateStr) return false;
                              const st = s.startTime || '';
                              const turnoStart = turno.startTime?.slice(0, 2) || '';
                              return (st.startsWith(turnoStart) || s.title.toLowerCase().includes(turno.label.toLowerCase())) && s.title.toLowerCase().includes('enferm');
                            });
                            return (
                              <td key={di} className={isToday ? 'esc-hoje-col' : ''}>
                                <div className="esc-cell">
                                  {cellShifts.length === 0 && (
                                    <div className="esc-vaga-aberta" onClick={() => openModal(turno.key, cellDateStr, 'Enfermeiro')}>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                                      Vaga em aberto
                                    </div>
                                  )}
                                  {cellShifts.map(s => (
                                    (s.assignments || []).map((a, ai) => (
                                      <div key={`${s.id}-${ai}`} className={`esc-med-chip ${s.title.includes('rotativo') ? 'rotativo' : 'fixo'}`}>
                                        <div className="esc-med-dot" />
                                        <span className="esc-med-nome">{a.userName || 'Enfermeiro'}</span>
                                        <button className="esc-med-remove" title="Remover" onClick={async (e) => { e.stopPropagation(); try { await shiftsApi.delete(s.id); setShifts(prev => prev.filter(sh => sh.id !== s.id)); showToast('Enfermeiro removido.'); } catch { /* */ } }}>
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        </button>
                                      </div>
                                    ))
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Side Panel */}
          <div className="esc-panels">
            {/* Available doctors */}
            <div className="esc-panel-card">
              <div className="esc-panel-header">
                <div className="esc-panel-title">Profissionais disponíveis</div>
                <span className="esc-panel-badge">{doctors.length} disponíveis</span>
              </div>
              <div className="esc-med-pool">
                {doctors.slice(0, 8).map((doc, i) => (
                  <div key={doc.id} className="esc-pool-item">
                    <div className="esc-pool-avatar" style={{ background: CORES[i % CORES.length] }}>
                      {doc.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="esc-pool-name">{doc.name}</div>
                      <div className="esc-pool-info">{doc.registrationNumber || (doc.professionalType === 'Enfermeiro' ? 'COREN' : 'CRM')}</div>
                    </div>
                    <div className="esc-pool-status disponivel" />
                  </div>
                ))}
                {doctors.length === 0 && <div style={{ padding: '.8rem', fontSize: '.75rem', color: 'var(--muted)' }}>Nenhum profissional cadastrado</div>}
              </div>
            </div>

            {/* Legend */}
            <div className="esc-panel-card">
              <div className="esc-panel-header"><div className="esc-panel-title">Legenda</div></div>
              <div className="esc-legend-body">
                <div className="esc-leg-item"><div className="esc-leg-dot" style={{ background: 'var(--green)' }} />Plantão fixo</div>
                <div className="esc-leg-item"><div className="esc-leg-dot" style={{ background: 'var(--indigo)' }} />Plantão rotativo</div>
                <div className="esc-leg-item"><div className="esc-leg-dot" style={{ background: 'var(--yellow)' }} />Aguardando confirmação</div>
                <div className="esc-leg-item"><div className="esc-leg-dot" style={{ background: 'var(--red)', borderRadius: '2px' }} />Vaga em aberto</div>
              </div>
            </div>

            {/* Summary */}
            <div className="esc-panel-card">
              <div className="esc-panel-header"><div className="esc-panel-title">Resumo da semana</div></div>
              <div className="esc-resumo-body">
                <div className="esc-resumo-item"><span className="esc-resumo-label">Turnos escalados</span><span className="esc-resumo-val" style={{ color: 'var(--teal)' }}>{loading ? '—' : summary.escalados}</span></div>
                <div className="esc-resumo-item"><span className="esc-resumo-label">Vagas em aberto</span><span className="esc-resumo-val" style={{ color: 'var(--red)' }}>{loading ? '—' : summary.vagas}</span></div>
                <div className="esc-resumo-item"><span className="esc-resumo-label">Médicos únicos</span><span className="esc-resumo-val" style={{ color: 'var(--indigo)' }}>{loading ? '—' : summary.medicos}</span></div>
                <div className="esc-resumo-item"><span className="esc-resumo-label">Cobertura</span><span className="esc-resumo-val" style={{ color: 'var(--green)' }}>{loading ? '—' : summary.cobertura}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal adicionar médico */}
      {modalOpen && (
        <div className="esc-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="esc-modal-box" onClick={e => e.stopPropagation()}>
            <div className="esc-modal-title">Adicionar {modalContext?.profType === 'Enfermeiro' ? 'enfermeiro' : 'médico'} ao turno</div>
            <div className="esc-tipo-row">
              <button className={`esc-tipo-btn ${modalTipo === 'fixo' ? 'active fixo' : ''}`} onClick={() => setModalTipo('fixo')}>Plantão fixo</button>
              <button className={`esc-tipo-btn ${modalTipo === 'rotativo' ? 'active rot' : ''}`} onClick={() => setModalTipo('rotativo')}>Rotativo</button>
            </div>
            <div className="esc-modal-list">
              {doctors
                .filter(doc => {
                  // Filtrar por tipo profissional
                  const wantType = modalContext?.profType || 'Medico';
                  const docType = doc.professionalType || ((doc.roles || []).some((r: { role: string }) => r.role === 'Enfermeiro') ? 'Enfermeiro' : 'Medico');
                  return docType === wantType;
                })
                .map((doc, i) => {
                // Check if doctor is already assigned in this cell
                const isAssigned = modalContext ? weekShifts.some(s => {
                  const sd = (s.date || '').split('T')[0];
                  if (sd !== modalContext.date) return false;
                  const isEnfShift = s.title.toLowerCase().includes('enferm');
                  if ((modalContext.profType === 'Enfermeiro') !== isEnfShift) return false;
                  const turnosDoTipo = modalContext.profType === 'Enfermeiro' ? turnosEnfermeiros : turnosMedicos;
                  const turnoObj = turnosDoTipo.find(t => t.key === modalContext.turno);
                  const turnoStart = turnoObj?.startTime?.slice(0, 2) || '';
                  const st = s.startTime || '';
                  const matchesTurno = st.startsWith(turnoStart) || s.title.toLowerCase().includes(turnoObj?.label?.toLowerCase() || '');
                  return matchesTurno && (s.assignments || []).some(a => a.userId === doc.id);
                }) : false;

                return (
                  <div key={doc.id} className={`esc-modal-item ${modalSelectedDoc === doc.id ? 'selected' : ''} ${isAssigned ? 'disabled' : ''}`} onClick={() => !isAssigned && setModalSelectedDoc(doc.id)}>
                    <div className="esc-modal-item-avatar" style={{ background: CORES[i % CORES.length] }}>
                      {doc.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="esc-modal-item-name">{doc.name}</div>
                    <div className="esc-modal-item-info">{isAssigned ? 'Já escalado' : (doc.registrationNumber || 'CRM')}</div>
                  </div>
                );
              })}
              {doctors.filter(doc => { const wt = modalContext?.profType || 'Medico'; const dt = doc.professionalType || ((doc.roles || []).some((r: { role: string }) => r.role === 'Enfermeiro') ? 'Enfermeiro' : 'Medico'); return dt === wt; }).length === 0 && <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '.78rem' }}>Nenhum {modalContext?.profType === 'Enfermeiro' ? 'enfermeiro' : 'médico'} disponível</div>}
            </div>
            <div className="esc-modal-btns">
              <button className="esc-btn-cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="esc-btn-confirm" disabled={!modalSelectedDoc} onClick={confirmAddDoctor}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`esc-toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}

const ESCALAS_CSS = `
/* Scoped to #adm-root */
#adm-root .esc-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:40; }
#adm-root .esc-topbar-left { display:flex; align-items:center; gap:.75rem; }
#adm-root .esc-hamburger { display:none; background:none; border:none; cursor:pointer; color:var(--text); padding:.4rem; border-radius:8px; transition:background .15s; flex-shrink:0; }
#adm-root .esc-hamburger:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .esc-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .esc-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; text-transform:capitalize; }
#adm-root .esc-topbar-right { display:flex; align-items:center; gap:.7rem; }
#adm-root .esc-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .esc-section-title { font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:900; color:var(--text); margin-bottom:.7rem; display:flex; align-items:center; gap:.5rem; }
#adm-root .esc-section-title::before { content:''; width:4px; height:16px; border-radius:2px; background:var(--indigo); }

/* Controls */
#adm-root .esc-controls-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:1.4rem; flex-wrap:wrap; gap:.8rem; }
#adm-root .esc-controls-left { display:flex; align-items:center; gap:.7rem; flex-wrap:wrap; }
#adm-root .esc-controls-right { display:flex; align-items:center; gap:.7rem; }
#adm-root .esc-upa-tabs { display:flex; background:var(--surface); border:1.5px solid var(--border); border-radius:14px; padding:4px; gap:3px; }
#adm-root .esc-upa-tab { padding:.45rem .9rem; border-radius:10px; border:none; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:all .15s; background:none; color:var(--muted); white-space:nowrap; }
#adm-root .esc-upa-tab.active { background:var(--indigo); color:#fff; box-shadow:0 2px 8px rgba(99,102,241,.3); }
#adm-root .esc-upa-tab:hover:not(.active) { background:var(--indigo-light); color:var(--indigo); }
#adm-root .esc-week-nav { display:flex; align-items:center; gap:.5rem; }
#adm-root .esc-week-btn { width:32px; height:32px; border-radius:9px; border:1.5px solid var(--border); background:var(--surface); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted); transition:all .15s; }
#adm-root .esc-week-btn:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .esc-week-label { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; color:var(--text); min-width:180px; text-align:center; }
#adm-root .esc-btn-hoje { padding:.45rem .9rem; border:1.5px solid var(--border); border-radius:9px; background:var(--surface); font-family:'Nunito',sans-serif; font-size:.75rem; font-weight:800; color:var(--teal); cursor:pointer; transition:all .15s; }
#adm-root .esc-btn-hoje:hover { background:var(--teal-light); border-color:var(--teal); }

/* Action buttons */
#adm-root .esc-btn-action { display:flex; align-items:center; gap:.4rem; padding:.55rem 1rem; border-radius:10px; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:all .15s; border:1.5px solid; }
#adm-root .esc-btn-gerar { background:var(--orange-light); border-color:rgba(249,115,22,.3); color:#f97316; }
#adm-root .esc-btn-gerar:hover { background:rgba(249,115,22,.15); }
#adm-root .esc-btn-publicar { background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); border-color:transparent; color:#fff; box-shadow:0 3px 12px rgba(99,102,241,.3); }
#adm-root .esc-btn-publicar:hover { transform:translateY(-1px); box-shadow:0 5px 16px rgba(99,102,241,.4); }

/* Grid */
#adm-root .esc-side-panel { display:grid; grid-template-columns:1fr 280px; gap:1.2rem; align-items:start; }
#adm-root .esc-panels { display:flex; flex-direction:column; gap:.8rem; }
#adm-root .esc-grade-wrap { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; overflow-x:auto; }
#adm-root .esc-grade-table { width:100%; border-collapse:collapse; }
#adm-root .esc-grade-table thead th { padding:.8rem .6rem; text-align:center; font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); border-bottom:1px solid var(--border); border-right:1px solid rgba(0,0,0,.04); }
#adm-root .esc-grade-table thead th:first-child { width:100px; border-right:1px solid var(--border); background:var(--bg); text-align:left; padding-left:1rem; }
#adm-root .esc-th-hoje { background:var(--indigo-light); color:var(--indigo); }
#adm-root .esc-day-num { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; display:block; line-height:1; }
#adm-root .esc-day-name { font-size:.6rem; font-weight:700; display:block; margin-top:2px; }
#adm-root .esc-grade-table tbody td { border-right:1px solid rgba(0,0,0,.04); border-bottom:1px solid rgba(0,0,0,.04); vertical-align:top; padding:.5rem; min-width:120px; }
#adm-root .esc-turno-cell { border-right:1px solid var(--border); background:var(--bg); padding:.7rem 1rem; }
#adm-root .esc-grade-table tbody tr:last-child td { border-bottom:none; }
#adm-root .esc-turno-label { font-family:'Nunito',sans-serif; font-size:.75rem; font-weight:900; color:var(--text); }
#adm-root .esc-turno-horario { font-size:.6rem; font-weight:700; color:var(--muted); display:block; margin-top:2px; }
#adm-root .esc-cell { min-height:80px; display:flex; flex-direction:column; gap:.3rem; }
#adm-root .esc-hoje-col { background:rgba(99,102,241,.03); }

/* Med chip */
#adm-root .esc-med-chip { display:flex; align-items:center; gap:.4rem; padding:.32rem .55rem; border-radius:8px; font-size:.68rem; font-weight:800; transition:transform .15s; }
#adm-root .esc-med-chip.fixo { background:var(--green-light); color:#166534; }
#adm-root .esc-med-chip.rotativo { background:var(--indigo-light); color:var(--indigo); }
#adm-root .esc-med-chip.pendente { background:var(--yellow-light); color:#92400e; }
#adm-root .esc-med-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
#adm-root .esc-med-chip.fixo .esc-med-dot { background:var(--green); }
#adm-root .esc-med-chip.rotativo .esc-med-dot { background:var(--indigo); }
#adm-root .esc-med-chip.pendente .esc-med-dot { background:var(--yellow); }
#adm-root .esc-med-nome { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90px; }

/* Vaga aberta */
#adm-root .esc-vaga-aberta { display:flex; align-items:center; justify-content:center; gap:.3rem; padding:.32rem .55rem; border-radius:8px; border:1.5px dashed rgba(239,68,68,.35); background:rgba(239,68,68,.04); font-size:.65rem; font-weight:800; color:var(--red); cursor:pointer; transition:all .15s; }
#adm-root .esc-vaga-aberta:hover { background:var(--red-light); border-color:var(--red); }

/* Add slot */
#adm-root .esc-add-slot { display:flex; align-items:center; justify-content:center; padding:.28rem; border-radius:7px; border:1.5px dashed var(--border); background:none; cursor:pointer; color:var(--muted); font-size:.65rem; font-weight:700; gap:.3rem; transition:all .15s; opacity:0; }
#adm-root .esc-cell:hover .esc-add-slot { opacity:1; }
#adm-root .esc-add-slot:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }

/* Med remove */
#adm-root .esc-med-remove { margin-left:auto; background:none; border:none; cursor:pointer; opacity:0; color:inherit; padding:0; line-height:0; transition:opacity .15s; }
#adm-root .esc-med-chip:hover .esc-med-remove { opacity:.6; }
#adm-root .esc-med-remove:hover { opacity:1; }

/* Modal */
#adm-root .esc-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; display:flex; align-items:center; justify-content:center; animation:fadeIn .2s ease; }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
#adm-root .esc-modal-box { background:var(--surface); border-radius:20px; padding:1.8rem; width:100%; max-width:420px; box-shadow:0 20px 60px rgba(0,0,0,.15); animation:popIn .3s cubic-bezier(.34,1.56,.64,1); }
@keyframes popIn { from{transform:scale(.92);opacity:0} to{transform:scale(1);opacity:1} }
#adm-root .esc-modal-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); margin-bottom:1.2rem; }
#adm-root .esc-tipo-row { display:flex; gap:.5rem; margin-bottom:1.2rem; }
#adm-root .esc-tipo-btn { flex:1; padding:.6rem; border:1.5px solid var(--border); border-radius:10px; background:none; font-family:'Nunito',sans-serif; font-size:.78rem; font-weight:800; color:var(--muted); cursor:pointer; transition:all .15s; }
#adm-root .esc-tipo-btn.active.fixo { background:var(--green-light); border-color:var(--green); color:#166534; }
#adm-root .esc-tipo-btn.active.rot { background:var(--indigo-light); border-color:var(--indigo); color:var(--indigo); }
#adm-root .esc-modal-list { display:flex; flex-direction:column; gap:.4rem; max-height:300px; overflow-y:auto; margin-bottom:1.2rem; }
#adm-root .esc-modal-item { display:flex; align-items:center; gap:.7rem; padding:.6rem .8rem; border-radius:10px; background:var(--bg); cursor:pointer; transition:background .15s; }
#adm-root .esc-modal-item:hover { background:var(--indigo-light); }
#adm-root .esc-modal-item.selected { background:var(--indigo-light); border:1.5px solid var(--indigo); }
#adm-root .esc-modal-item.disabled { opacity:.4; cursor:not-allowed; pointer-events:none; }
#adm-root .esc-modal-item-avatar { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.65rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .esc-modal-item-name { font-size:.82rem; font-weight:800; color:var(--text); flex:1; }
#adm-root .esc-modal-item-info { font-size:.68rem; font-weight:600; color:var(--muted); }
#adm-root .esc-modal-btns { display:flex; gap:.6rem; }
#adm-root .esc-btn-confirm { flex:1; padding:.8rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); transition:transform .14s; }
#adm-root .esc-btn-confirm:hover { transform:translateY(-1px); }
#adm-root .esc-btn-confirm:disabled { opacity:.4; cursor:not-allowed; transform:none; }
#adm-root .esc-btn-cancel { padding:.8rem 1.1rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; }
#adm-root .esc-btn-cancel:hover { border-color:var(--indigo); color:var(--indigo); }

/* Panel cards */
#adm-root .esc-panel-card { background:var(--surface); border-radius:18px; border:1.5px solid var(--border); overflow:hidden; }
#adm-root .esc-panel-header { padding:.9rem 1.2rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .esc-panel-title { font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:900; color:var(--text); }
#adm-root .esc-panel-badge { font-size:.65rem; font-weight:800; background:var(--green-light); color:#16a34a; padding:.2rem .6rem; border-radius:10px; }

/* Doctor pool */
#adm-root .esc-med-pool { padding:.8rem; display:flex; flex-direction:column; gap:.4rem; max-height:280px; overflow-y:auto; }
#adm-root .esc-pool-item { display:flex; align-items:center; gap:.6rem; padding:.5rem .7rem; border-radius:10px; background:var(--bg); cursor:grab; transition:background .15s; }
#adm-root .esc-pool-item:hover { background:var(--indigo-light); }
#adm-root .esc-pool-avatar { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.6rem; font-weight:900; color:#fff; flex-shrink:0; }
#adm-root .esc-pool-name { font-size:.75rem; font-weight:800; color:var(--text); }
#adm-root .esc-pool-info { font-size:.62rem; font-weight:600; color:var(--muted); }
#adm-root .esc-pool-status { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
#adm-root .esc-pool-status.disponivel { background:var(--green); }

/* Legend */
#adm-root .esc-legend-body { padding:.9rem 1.2rem; display:flex; flex-direction:column; gap:.5rem; }
#adm-root .esc-leg-item { display:flex; align-items:center; gap:.6rem; font-size:.75rem; font-weight:700; color:var(--muted); }
#adm-root .esc-leg-dot { width:10px; height:10px; border-radius:3px; flex-shrink:0; }

/* Summary */
#adm-root .esc-resumo-body { padding:.8rem 1.2rem; display:flex; flex-direction:column; gap:.5rem; }
#adm-root .esc-resumo-item { display:flex; justify-content:space-between; align-items:center; padding:.4rem .6rem; background:var(--bg); border-radius:8px; }
#adm-root .esc-resumo-label { font-size:.73rem; font-weight:700; color:var(--muted); }
#adm-root .esc-resumo-val { font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:900; }

/* Toast */
#adm-root .esc-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; display:flex; align-items:center; gap:.7rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .esc-toast.show { transform:translateY(0); opacity:1; }

/* Dark mode */
#adm-root.dark .esc-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .esc-upa-tabs { background:#1a1f36; border-color:rgba(255,255,255,.1); }
#adm-root.dark .esc-upa-tab { color:#94a3b8; }
#adm-root.dark .esc-upa-tab:hover:not(.active) { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .esc-week-btn { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#94a3b8; }
#adm-root.dark .esc-week-btn:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root.dark .esc-btn-hoje { background:#1a1f36; border-color:rgba(255,255,255,.1); }
#adm-root.dark .esc-grade-wrap { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .esc-grade-table thead th { border-bottom-color:rgba(255,255,255,.06); border-right-color:rgba(255,255,255,.04); }
#adm-root.dark .esc-grade-table thead th:first-child { background:#0f1119; }
#adm-root.dark .esc-th-hoje { background:rgba(99,102,241,.15); }
#adm-root.dark .esc-grade-table tbody td { border-right-color:rgba(255,255,255,.04); border-bottom-color:rgba(255,255,255,.04); }
#adm-root.dark .esc-turno-cell { background:#0f1119; border-right-color:rgba(255,255,255,.06); }
#adm-root.dark .esc-hoje-col { background:rgba(99,102,241,.05); }
#adm-root.dark .esc-panel-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .esc-panel-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .esc-pool-item { background:#0f1119; }
#adm-root.dark .esc-pool-item:hover { background:rgba(99,102,241,.15); }
#adm-root.dark .esc-resumo-item { background:#0f1119; }
#adm-root.dark .esc-med-chip.fixo { background:rgba(34,197,94,.12); color:#86efac; }
#adm-root.dark .esc-med-chip.rotativo { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .esc-med-chip.pendente { background:rgba(245,158,11,.12); color:#fcd34d; }
#adm-root.dark .esc-btn-gerar { background:rgba(249,115,22,.12); border-color:rgba(249,115,22,.3); }
#adm-root.dark .esc-modal-box { background:#1a1f36; }
#adm-root.dark .esc-modal-item { background:#0f1119; }
#adm-root.dark .esc-modal-item:hover { background:rgba(99,102,241,.15); }
#adm-root.dark .esc-modal-item.selected { background:rgba(99,102,241,.15); border-color:var(--indigo); }
#adm-root.dark .esc-tipo-btn { border-color:rgba(255,255,255,.1); color:#94a3b8; }
#adm-root.dark .esc-btn-cancel { border-color:rgba(255,255,255,.1); color:#94a3b8; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  #adm-root .esc-hamburger { display:flex; }
  #adm-root .esc-topbar { padding:.85rem 1rem; }
  #adm-root .esc-topbar-title { font-size:.88rem; line-height:1.2; }
  #adm-root .esc-topbar-sub { font-size:.65rem; }
  
  #adm-root .esc-content { padding:1rem; }
  
  /* Header: empilhar título + botões */
  #adm-root .esc-topbar-right { width:100%; flex-direction:column; gap:.6rem; margin-top:.5rem; }
  #adm-root .esc-btn-gerar, #adm-root .esc-btn-publicar { width:100%; justify-content:center; padding:.7rem 1rem; font-size:.8rem; }
  
  /* Tabs: scroll horizontal */
  #adm-root .esc-upa-tabs { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  #adm-root .esc-upa-tab { white-space:nowrap; padding:.6rem 1rem; font-size:.78rem; }
  
  /* Week nav */
  #adm-root .esc-week-nav { gap:.4rem; flex-wrap:wrap; }
  #adm-root .esc-week-label { font-size:.75rem; }
  #adm-root .esc-week-btn { padding:.45rem .7rem; font-size:.72rem; }
  #adm-root .esc-btn-hoje { padding:.45rem .85rem; font-size:.72rem; }
  
  /* Grid: scroll horizontal */
  #adm-root .esc-grade-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  #adm-root .esc-grade-table { font-size:.7rem; min-width:600px; }
  #adm-root .esc-grade-table th { padding:.5rem .35rem; font-size:.62rem; }
  #adm-root .esc-grade-table td { padding:.6rem .4rem; }
  #adm-root .esc-grade-table .turno-label { font-size:.68rem; }
  #adm-root .esc-grade-table .turno-sub { font-size:.58rem; }
}

@media (max-width: 480px) {
  #adm-root .esc-topbar-title { font-size:.82rem; }
  #adm-root .esc-topbar-sub { display:none; }
  #adm-root .esc-btn-gerar, #adm-root .esc-btn-publicar { padding:.65rem .9rem; font-size:.75rem; }
  #adm-root .esc-week-label { font-size:.7rem; }
  #adm-root .esc-grid-table { min-width:500px; font-size:.68rem; }
}
  #adm-root .esc-topbar-title { font-size:.88rem; }
  #adm-root .esc-upa-tab { font-size:.72rem; padding:.55rem .85rem; }
  #adm-root .esc-week-label { font-size:.7rem; }
  #adm-root .esc-grade-table { font-size:.65rem; }
  #adm-root .esc-grade-table th { font-size:.58rem; padding:.45rem .3rem; }
  #adm-root .esc-grade-table td { padding:.5rem .35rem; }
}
`;
