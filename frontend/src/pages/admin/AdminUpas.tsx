/**
 * Admin OS — Unidades (UPAs) CRUD page.
 * Geocoding automático via endereço usando Nominatim (OpenStreetMap).
 * Replicates mock at /originais/OS/admin-upas.html.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { clinicsApi } from '../../api/clinicsApi';
import { contractsApi } from '../../api/contractsApi';
import { useAuth } from '../../hooks/useAuth';
import type { Clinic, CreateClinicRequest, UpdateClinicRequest, Contract } from '../../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function maskCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const CARD_COLORS = [
  { bg: '#eef2ff', stroke: '#6366f1' },
  { bg: '#fff7ed', stroke: '#f97316' },
  { bg: '#ede9fe', stroke: '#8b5cf6' },
  { bg: '#dcfce7', stroke: '#22c55e' },
  { bg: '#e8faf9', stroke: '#2DBFB8' },
  { bg: '#fee2e2', stroke: '#ef4444' },
];

async function fetchViaCep(cep: string): Promise<{
  logradouro: string; bairro: string; localidade: string; uf: string; erro?: boolean;
} | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch { return null; }
}

async function geocodeAddress(address: string, city: string, neighborhood: string): Promise<{ lat: number; lon: number } | null> {
  const q = [address, neighborhood, city, 'Brasil'].filter(Boolean).join(', ');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'DutyHub/1.0' } }
    );
    const data = await res.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return null;
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
    <div className="upa-cselect" ref={ref}>
      <button className="upa-cselect-btn" type="button" onClick={() => setOpen(!open)}>
        <span>{selected?.label || '—'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="upa-cselect-dropdown">
          {options.map(o => (
            <div key={o.value} className={`upa-cselect-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="upa-toggle-wrap">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="upa-toggle-slider" />
    </label>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props { onBack: () => void; dark: boolean; onToggleTheme: () => void; }

interface TurnoForm { id: string; name: string; start: string; end: string; staff: string; profType: 1 | 2; enabled: boolean; }

const DEFAULT_TURNOS: TurnoForm[] = [
  { id: 'manha', name: 'Manhã',  start: '07:00', end: '19:00', staff: '4', profType: 1, enabled: true  },
  { id: 'tarde', name: 'Tarde',  start: '13:00', end: '01:00', staff: '4', profType: 1, enabled: false },
  { id: 'noite', name: 'Noite',  start: '19:00', end: '07:00', staff: '4', profType: 1, enabled: true  },
];
const DEFAULT_TURNOS_ENF: TurnoForm[] = [
  { id: 'enf-manha', name: 'Manhã (Enf.)', start: '07:00', end: '19:00', staff: '2', profType: 2, enabled: false },
  { id: 'enf-noite', name: 'Noite (Enf.)', start: '19:00', end: '07:00', staff: '2', profType: 2, enabled: false },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminUpas({ onBack: _onBack, dark, onToggleTheme }: Props) {
  const { user: authUser } = useAuth();
  const isAdminGlobal = (authUser?.roles ?? []).includes('AdminGlobal');

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  // Form fields
  const [fName, setFName] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fAddress, setFAddress] = useState('');
  const [fNeighborhood, setFNeighborhood] = useState('');
  const [fCity, setFCity] = useState('');
  const [fZip, setFZip] = useState('');
  const [fCapacity, setFCapacity] = useState('');
  const [fDoctorsPerShift, setFDoctorsPerShift] = useState('');
  const [fRadius, setFRadius] = useState('150');
  const [fLat, setFLat] = useState('');
  const [fLon, setFLon] = useState('');
  const [fHasNursing, setFHasNursing] = useState(false);
  const [fIsActive, setFIsActive] = useState(true);
  const [fContractId, setFContractId] = useState('');

  // Turnos state
  const [fTurnos, setFTurnos] = useState<TurnoForm[]>(DEFAULT_TURNOS);
  const [fTurnosEnf, setFTurnosEnf] = useState<TurnoForm[]>(DEFAULT_TURNOS_ENF);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [clinicData, contractData] = await Promise.all([
        clinicsApi.getAll(),
        contractsApi.getAll(),
      ]);
      setClinics(Array.isArray(clinicData) ? clinicData : []);
      setContracts(Array.isArray(contractData) ? contractData : []);
    } catch { /* graceful */ } finally { setLoading(false); }
  }

  const kpiTotal = clinics.length;
  const kpiAtivas = clinics.filter(c => c.isActive).length;
  const kpiGeo = clinics.filter(c => c.latitude && c.longitude).length;
  const kpiDoctors = clinics.reduce((sum, c) => sum + (c.doctorsPerShift || 0), 0);

  const filtered = useMemo(() => clinics.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.address || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === 'ativa' && !c.isActive) return false;
    if (filterStatus === 'inativa' && c.isActive) return false;
    return true;
  }), [clinics, search, filterStatus]);

  function resetForm() {
    setFName(''); setFPhone(''); setFAddress(''); setFNeighborhood('');
    setFCity(''); setFZip(''); setFCapacity(''); setFDoctorsPerShift('');
    setFRadius('150'); setFLat(''); setFLon(''); setFHasNursing(false); setFIsActive(true);
    setFContractId('');
    setFTurnos(DEFAULT_TURNOS); setFTurnosEnf(DEFAULT_TURNOS_ENF);
  }

  function openDrawer(clinic?: Clinic) {
    setEditingId(clinic?.id ?? null);
    if (clinic) {
      setFName(clinic.name);
      setFPhone(clinic.phone ? maskPhone(clinic.phone) : '');
      setFAddress(clinic.address || '');
      setFNeighborhood(clinic.neighborhood || '');
      setFCity(clinic.city || '');
      setFZip(clinic.zipCode ? maskCep(clinic.zipCode) : '');
      setFCapacity(clinic.capacity?.toString() || '');
      setFDoctorsPerShift(clinic.doctorsPerShift?.toString() || '');
      setFRadius(clinic.allowedRadiusMeters?.toString() || '150');
      setFLat(clinic.latitude?.toString() || '');
      setFLon(clinic.longitude?.toString() || '');
      setFHasNursing(clinic.hasNursing);
      setFIsActive(clinic.isActive);
      setFContractId(clinic.contractId ?? '');
      // Populate shift templates from existing data
      const templates = clinic.shiftTemplates || [];
      const medTemplates = templates.filter(t => t.professionalType === 'Medico' || t.professionalType === '1' || (t.professionalType as unknown as number) === 1);
      const enfTemplates = templates.filter(t => t.professionalType === 'Enfermeiro' || t.professionalType === '2' || (t.professionalType as unknown as number) === 2);
      if (medTemplates.length > 0) {
        setFTurnos(DEFAULT_TURNOS.map(dt => {
          // Match by name ignoring accents/case, or by start time
          const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const match = medTemplates.find(t =>
            normalize(t.name) === normalize(dt.name) ||
            String(t.startTime).slice(0, 5) === dt.start
          );
          return match
            ? { ...dt, start: String(match.startTime).slice(0, 5), end: String(match.endTime).slice(0, 5), staff: String(match.requiredStaff), enabled: true }
            : { ...dt, enabled: false };
        }));
      } else { setFTurnos(DEFAULT_TURNOS.map(t => ({ ...t, enabled: false }))); }
      if (enfTemplates.length > 0) {
        setFTurnosEnf(DEFAULT_TURNOS_ENF.map((dt, i) => {
          const match = enfTemplates[i];
          return match
            ? { ...dt, start: String(match.startTime).slice(0, 5), end: String(match.endTime).slice(0, 5), staff: String(match.requiredStaff), enabled: true }
            : { ...dt, enabled: false };
        }));
      } else { setFTurnosEnf(DEFAULT_TURNOS_ENF.map(t => ({ ...t, enabled: false }))); }
    } else {
      resetForm();
    }
    setDrawerOpen(true);
  }

  function closeDrawer() { setDrawerOpen(false); }

  function showToast(msg: string, err = false) {
    setToast(msg); setToastError(err);
    setTimeout(() => setToast(''), 3500);
  }

  async function handleCepChange(raw: string) {
    const masked = maskCep(raw);
    setFZip(masked);
    const digits = masked.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    const result = await fetchViaCep(digits);
    setCepLoading(false);
    if (!result) { showToast('CEP não encontrado.', true); return; }
    if (result.logradouro) setFAddress(result.logradouro);
    if (result.bairro) setFNeighborhood(result.bairro);
    if (result.localidade) setFCity(result.localidade);
    showToast(`Endereço preenchido via CEP!`);
  }

  async function handleGeocode() {
    if (!fAddress && !fCity) { showToast('Preencha o endereço ou cidade para geocodificar.', true); return; }
    setGeocoding(true);
    const result = await geocodeAddress(fAddress, fCity, fNeighborhood);
    setGeocoding(false);
    if (result) {
      setFLat(result.lat.toFixed(6));
      setFLon(result.lon.toFixed(6));
      showToast('Coordenadas obtidas com sucesso!');
    } else {
      showToast('Não foi possível obter as coordenadas. Verifique o endereço.', true);
    }
  }

  async function salvar() {
    if (!fName.trim()) { showToast('Nome da unidade é obrigatório.', true); return; }
    setSaving(true);
    try {
      const base = {
        name: fName.trim(),
        address: fAddress.trim() || '',
        phone: fPhone.replace(/\D/g, '') || '',
        city: fCity.trim() || null,
        neighborhood: fNeighborhood.trim() || null,
        zipCode: fZip.replace(/\D/g, '') || null,
        capacity: fCapacity ? parseInt(fCapacity) : null,
        doctorsPerShift: fDoctorsPerShift ? parseInt(fDoctorsPerShift) : null,
        allowedRadiusMeters: fRadius ? parseFloat(fRadius) : null,
        latitude: fLat ? parseFloat(fLat) : null,
        longitude: fLon ? parseFloat(fLon) : null,
        hasNursing: fHasNursing,
        contractId: fContractId || null,
      };

      let savedClinic: Clinic;
      if (editingId) {
        savedClinic = await clinicsApi.update(editingId, { ...base, isActive: fIsActive } as UpdateClinicRequest);
      } else {
        savedClinic = await clinicsApi.create(base as CreateClinicRequest);
      }

      // Save shift templates — always call to replace (even empty = clear all)
      const allTurnos = [
        ...fTurnos.filter(t => t.enabled).map((t, i) => ({
          name: t.name, startTime: t.start + ':00', endTime: t.end + ':00',
          requiredStaff: parseInt(t.staff) || 1, displayOrder: i + 1, professionalType: 1,
        })),
        ...(fHasNursing ? fTurnosEnf.filter(t => t.enabled).map((t, i) => ({
          name: t.name, startTime: t.start + ':00', endTime: t.end + ':00',
          requiredStaff: parseInt(t.staff) || 1, displayOrder: i + 1, professionalType: 2,
        })) : []),
      ];
      await clinicsApi.upsertShiftTemplates(savedClinic.id, allTurnos);

      await load();
      closeDrawer();
      showToast(editingId ? 'UPA atualizada com sucesso!' : 'UPA cadastrada com sucesso!');
    } catch (err: unknown) {
      let msg = 'Erro ao salvar';
      if (err && typeof err === 'object' && 'response' in err) {
        const r = (err as { response?: { data?: { detail?: string } } }).response;
        if (r?.data?.detail) msg = r.data.detail;
      }
      showToast(msg, true);
    } finally { setSaving(false); }
  }

  async function toggleStatus(clinic: Clinic) {
    try {
      const updated = await clinicsApi.toggleStatus(clinic.id);
      // Update local state immediately with API response — don't wait for load()
      setClinics(prev => prev.map(c => c.id === updated.id ? { ...c, isActive: updated.isActive } : c));
      showToast(`${clinic.name} ${updated.isActive ? 'reativada' : 'desativada'}!`);
    } catch { showToast('Erro ao alterar status.', true); }
  }

  const formValid = fName.trim() !== '';
  const ThemeIcon = dark
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: UPAS_CSS + UPAS_CSS_DRAWER }} />

      {/* Topbar */}
      <div className="upa-topbar">
        <div>
          <div className="upa-topbar-title">Unidades de Pronto Atendimento (UPAs)</div>
          <div className="upa-topbar-sub">Cadastro e configuração das unidades vinculadas aos contratos</div>
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>{ThemeIcon}</button>
      </div>

      <div className="upa-content">
        {/* Page header */}
        <div className="upa-page-header">
          <div>
            <div className="upa-page-title">Gestão de UPAs</div>
            <div className="upa-page-sub">Configure endereço, geolocalização, turnos e metas por unidade</div>
          </div>
          {isAdminGlobal && (
            <button className="upa-btn-novo" onClick={() => openDrawer()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nova UPA
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="upa-kpi-strip">
          <div className="upa-kpi indigo"><div className="upa-kpi-lbl">Total de UPAs</div><div className="upa-kpi-val">{loading ? '—' : kpiTotal}</div><div className="upa-kpi-sub">unidades cadastradas</div></div>
          <div className="upa-kpi green"><div className="upa-kpi-lbl">Ativas</div><div className="upa-kpi-val">{loading ? '—' : kpiAtivas}</div><div className="upa-kpi-sub">em operação</div></div>
          <div className="upa-kpi teal"><div className="upa-kpi-lbl">Com geolocalização</div><div className="upa-kpi-val">{loading ? '—' : kpiGeo}</div><div className="upa-kpi-sub">check-in automático</div></div>
          <div className="upa-kpi yellow"><div className="upa-kpi-lbl">Meta méd./turno</div><div className="upa-kpi-val">{loading ? '—' : kpiDoctors}</div><div className="upa-kpi-sub">médicos escalados</div></div>
        </div>

        {/* Filtros */}
        <div className="upa-filter-bar">
          <div className="upa-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="upa-search-input" type="text" placeholder="Buscar por nome ou endereço..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <CustomSelect value={filterStatus} onChange={setFilterStatus} options={[
            { value: '', label: 'Todos os status' },
            { value: 'ativa', label: 'Ativa' },
            { value: 'inativa', label: 'Inativa' },
          ]} />
        </div>

        {/* Cards */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
            {clinics.length === 0 ? 'Nenhuma UPA cadastrada. Clique em "Nova UPA" para começar.' : 'Nenhuma UPA encontrada.'}
          </div>
        ) : (
          <div className="upa-cards-grid">
            {filtered.map((clinic, i) => {
              const color = CARD_COLORS[i % CARD_COLORS.length];
              const hasGeo = !!(clinic.latitude && clinic.longitude);
              const templates = clinic.shiftTemplates || [];
              return (
                <div key={clinic.id} className="upa-card">
                  <div className="upa-card-header">
                    <div className="upa-card-icon" style={{ background: color.bg }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="upa-card-nome">{clinic.name}</div>
                      <div className="upa-card-orgao">{[clinic.city, clinic.phone].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <span className={`upa-badge ${clinic.isActive ? 'upa-badge-ativo' : 'upa-badge-inativo'}`}>
                      {clinic.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>

                  <div className="upa-card-body">
                    <div className="upa-info-grid">
                      <div className="upa-info-item"><div className="upa-info-lbl">Capacidade</div><div className="upa-info-val">{clinic.capacity ? `${clinic.capacity} leitos` : '—'}</div></div>
                      <div className="upa-info-item"><div className="upa-info-lbl">Meta méd./turno</div><div className="upa-info-val">{clinic.doctorsPerShift ? `${clinic.doctorsPerShift} méd.` : '—'}</div></div>
                      <div className="upa-info-item"><div className="upa-info-lbl">Endereço</div><div className="upa-info-val" style={{ fontSize: '.75rem' }}>{clinic.address || '—'}</div></div>
                      <div className="upa-info-item"><div className="upa-info-lbl">Raio geo (m)</div><div className="upa-info-val">{clinic.allowedRadiusMeters ? `${clinic.allowedRadiusMeters} m` : '—'}</div></div>
                    </div>

                    {templates.length > 0 && (
                      <div className="upa-turnos-wrap">
                        {templates.slice(0, 3).map(t => (
                          <span key={t.id} className="upa-turno-chip">
                            {t.name} {String(t.startTime).slice(0, 5).replace(':', 'h')}–{String(t.endTime).slice(0, 5).replace(':', 'h')}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={`upa-geo-tag ${hasGeo ? 'ok' : ''}`}>
                      {hasGeo ? (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Geolocalização configurada</>
                      ) : (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Geolocalização pendente</>
                      )}
                    </div>
                  </div>

                  <div className="upa-card-footer">
                    <div className="upa-footer-info">
                      {clinic.createdAt ? `Cadastrada em ${new Date(clinic.createdAt).toLocaleDateString('pt-BR')}` : ''}
                    </div>
                    <div className="upa-card-actions">
                      <button className="upa-act-btn" title="Editar" onClick={() => openDrawer(clinic)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      {isAdminGlobal && (
                        <button className={`upa-act-btn ${clinic.isActive ? 'upa-act-danger' : 'upa-act-activate'}`} title={clinic.isActive ? 'Desativar' : 'Reativar'} onClick={() => toggleStatus(clinic)}>
                          {clinic.isActive
                            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawer overlay */}
      {drawerOpen && <div className="upa-overlay" onClick={closeDrawer} />}
      <div className={`upa-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="upa-drawer-header">
          <div className="upa-drawer-title">{editingId ? 'Editar UPA' : 'Nova UPA'}</div>
          <button className="upa-drawer-close" onClick={closeDrawer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="upa-drawer-body">
          {/* Identificação */}
          <div className="upa-form-section">
            <div className="upa-form-section-title">Identificação</div>
            <div className="upa-form-row full">
              <div className="upa-field"><label>Nome da unidade *</label><input type="text" placeholder="Ex: UPA – Vila Pereira" value={fName} onChange={e => setFName(e.target.value)} /></div>
            </div>
            {/* Contrato — somente AdminGlobal pode vincular ao criar */}
            {isAdminGlobal && (
              <div className="upa-form-row full">
                <div className="upa-field">
                  <label>Contrato vinculado</label>
                  <CustomSelect
                    value={fContractId}
                    onChange={setFContractId}
                    options={[
                      { value: '', label: 'Sem contrato (vincular depois)' },
                      ...contracts.map(c => ({
                        value: c.id,
                        label: `${c.publicOrganName} · ${c.contractNumber}`,
                      })),
                    ]}
                  />
                </div>
              </div>
            )}
            <div className="upa-form-row">
              <div className="upa-field"><label>Telefone</label><input type="text" placeholder="(11) 99999-9999" value={fPhone} onChange={e => setFPhone(maskPhone(e.target.value))} maxLength={15} /></div>
              {editingId && isAdminGlobal && (
                <div className="upa-field"><label>Status</label>
                  <CustomSelect value={fIsActive ? 'ativa' : 'inativa'} onChange={v => setFIsActive(v === 'ativa')} options={[{ value: 'ativa', label: 'Ativa' }, { value: 'inativa', label: 'Inativa' }]} />
                </div>
              )}
            </div>
            <div className="upa-form-row">
              <div className="upa-field"><label>Capacidade (leitos)</label><input type="number" placeholder="Ex: 50" value={fCapacity} onChange={e => setFCapacity(e.target.value)} min={0} /></div>
              <div className="upa-field"><label>Meta médicos / turno</label><input type="number" placeholder="Ex: 4" value={fDoctorsPerShift} onChange={e => setFDoctorsPerShift(e.target.value)} min={0} /></div>
            </div>
          </div>

          {/* Endereço */}
          <div className="upa-form-section">
            <div className="upa-form-section-title">Endereço</div>
            <div className="upa-form-row full">
              <div className="upa-field">
                <label>CEP {cepLoading && <span className="upa-cep-loading">buscando...</span>}</label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={fZip}
                  onChange={e => handleCepChange(e.target.value)}
                  maxLength={9}
                  className={cepLoading ? 'upa-input-loading' : ''}
                />
                <span className="upa-field-hint">Digite o CEP para preencher o endereço automaticamente.</span>
              </div>
            </div>
            <div className="upa-form-row full">
              <div className="upa-field"><label>Logradouro</label><input type="text" placeholder="Ex: Rua das Flores, 210" value={fAddress} onChange={e => setFAddress(e.target.value)} /></div>
            </div>
            <div className="upa-form-row">
              <div className="upa-field"><label>Bairro</label><input type="text" placeholder="Bairro" value={fNeighborhood} onChange={e => setFNeighborhood(e.target.value)} /></div>
              <div className="upa-field"><label>Cidade</label><input type="text" placeholder="São Paulo" value={fCity} onChange={e => setFCity(e.target.value)} /></div>
            </div>
          </div>

          {/* Geolocalização */}
          <div className="upa-form-section">
            <div className="upa-form-section-title">Geolocalização para check-in</div>
            <button className="upa-btn-geo" type="button" onClick={handleGeocode} disabled={geocoding}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {geocoding ? 'Buscando coordenadas...' : 'Obter coordenadas pelo endereço'}
            </button>
            <div className="upa-form-row" style={{ marginTop: '.8rem' }}>
              <div className="upa-field"><label>Latitude</label><input type="text" placeholder="-23.5505" value={fLat} onChange={e => setFLat(e.target.value)} /></div>
              <div className="upa-field"><label>Longitude</label><input type="text" placeholder="-46.6333" value={fLon} onChange={e => setFLon(e.target.value)} /></div>
            </div>
            <div className="upa-form-row full">
              <div className="upa-field">
                <label>Raio de tolerância para check-in (metros)</label>
                <input type="number" placeholder="Ex: 150" value={fRadius} onChange={e => setFRadius(e.target.value)} min={50} />
                <span className="upa-field-hint">O médico precisa estar dentro deste raio para realizar check-in.</span>
              </div>
            </div>
          </div>

          {/* Turnos */}
          <div className="upa-form-section">
            <div className="upa-form-section-title">Turnos ativos</div>
            <div className="upa-turnos-config">
              {fTurnos.map((t, i) => (
                <div key={t.id} className={`upa-turno-config-row ${t.enabled ? 'enabled' : ''}`}>
                  <Toggle checked={t.enabled} onChange={v => setFTurnos(prev => prev.map((x, j) => j === i ? { ...x, enabled: v } : x))} />
                  <div className="upa-turno-config-info">
                    <span className="upa-turno-config-name">{t.name}</span>
                    {t.enabled && (
                      <div className="upa-turno-config-fields">
                        <div className="upa-turno-mini-field">
                          <label>Início</label>
                          <input type="time" value={t.start} onChange={e => setFTurnos(prev => prev.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
                        </div>
                        <div className="upa-turno-mini-field">
                          <label>Fim</label>
                          <input type="time" value={t.end} onChange={e => setFTurnos(prev => prev.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
                        </div>
                        <div className="upa-turno-mini-field">
                          <label>Vagas</label>
                          <input type="number" min={1} max={20} value={t.staff} onChange={e => setFTurnos(prev => prev.map((x, j) => j === i ? { ...x, staff: e.target.value } : x))} />
                        </div>
                      </div>
                    )}
                    {!t.enabled && <span className="upa-turno-config-off">Desativado</span>}
                  </div>
                </div>
              ))}
            </div>

            {fHasNursing && (
              <>
                <div className="upa-turno-section-label">Enfermagem</div>
                <div className="upa-turnos-config">
                  {fTurnosEnf.map((t, i) => (
                    <div key={t.id} className={`upa-turno-config-row ${t.enabled ? 'enabled' : ''}`}>
                      <Toggle checked={t.enabled} onChange={v => setFTurnosEnf(prev => prev.map((x, j) => j === i ? { ...x, enabled: v } : x))} />
                      <div className="upa-turno-config-info">
                        <span className="upa-turno-config-name">{t.name}</span>
                        {t.enabled && (
                          <div className="upa-turno-config-fields">
                            <div className="upa-turno-mini-field">
                              <label>Início</label>
                              <input type="time" value={t.start} onChange={e => setFTurnosEnf(prev => prev.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
                            </div>
                            <div className="upa-turno-mini-field">
                              <label>Fim</label>
                              <input type="time" value={t.end} onChange={e => setFTurnosEnf(prev => prev.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
                            </div>
                            <div className="upa-turno-mini-field">
                              <label>Vagas</label>
                              <input type="number" min={1} max={20} value={t.staff} onChange={e => setFTurnosEnf(prev => prev.map((x, j) => j === i ? { ...x, staff: e.target.value } : x))} />
                            </div>
                          </div>
                        )}
                        {!t.enabled && <span className="upa-turno-config-off">Desativado</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Configurações */}
          <div className="upa-form-section">
            <div className="upa-form-section-title">Configurações</div>
            <div className="upa-toggle-row">
              <div>
                <div className="upa-toggle-label">Escala de enfermagem</div>
                <div className="upa-toggle-sub">Habilita grade separada para escalas de enfermeiros</div>
              </div>
              <Toggle checked={fHasNursing} onChange={setFHasNursing} />
            </div>
          </div>
        </div>

        <div className="upa-drawer-footer">
          <button className="upa-btn-cancelar" onClick={closeDrawer}>Cancelar</button>
          <button className="upa-btn-salvar" disabled={!formValid || saving} onClick={salvar}>
            {saving ? 'Salvando...' : editingId ? 'Atualizar UPA' : 'Salvar UPA'}
          </button>
        </div>
      </div>

      {/* Toast */}
      <div className={`upa-toast ${toast ? 'show' : ''} ${toastError ? 'error' : ''}`}>{toast}</div>
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const UPAS_CSS = `
#adm-root .upa-topbar { background:var(--surface); border-bottom:1px solid var(--border); padding:1rem 2rem; position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:space-between; }
#adm-root .upa-topbar-title { font-family:'Nunito',sans-serif; font-size:1.05rem; font-weight:900; color:var(--text); }
#adm-root .upa-topbar-sub { font-size:.7rem; font-weight:600; color:var(--muted); margin-top:1px; }
#adm-root .upa-content { flex:1; padding:2rem; overflow-y:auto; animation:fadeUp .35s ease; }
#adm-root .upa-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.6rem; flex-wrap:wrap; gap:1rem; }
#adm-root .upa-page-title { font-family:'Nunito',sans-serif; font-size:1.3rem; font-weight:900; color:var(--text); }
#adm-root .upa-page-sub { font-size:.78rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .upa-btn-novo { display:flex; align-items:center; gap:.45rem; padding:.65rem 1.3rem; border:none; border-radius:12px; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); color:#fff; font-family:'Nunito',sans-serif; font-size:.85rem; font-weight:800; cursor:pointer; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:transform .14s; }
#adm-root .upa-btn-novo:hover { transform:translateY(-1px); }
#adm-root .upa-kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.6rem; }
#adm-root .upa-kpi { background:var(--surface); border-radius:16px; border:1.5px solid var(--border); padding:1rem 1.2rem; position:relative; overflow:hidden; }
#adm-root .upa-kpi::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:3px 3px 0 0; }
#adm-root .upa-kpi.indigo::after{background:var(--indigo);} #adm-root .upa-kpi.green::after{background:var(--green);} #adm-root .upa-kpi.teal::after{background:var(--teal);} #adm-root .upa-kpi.yellow::after{background:var(--yellow);}
#adm-root .upa-kpi-lbl { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:.25rem; }
#adm-root .upa-kpi-val { font-family:'Nunito',sans-serif; font-size:1.7rem; font-weight:900; line-height:1; }
#adm-root .upa-kpi.indigo .upa-kpi-val{color:var(--indigo);} #adm-root .upa-kpi.green .upa-kpi-val{color:var(--green);} #adm-root .upa-kpi.teal .upa-kpi-val{color:var(--teal);} #adm-root .upa-kpi.yellow .upa-kpi-val{color:var(--yellow);}
#adm-root .upa-kpi-sub { font-size:.67rem; font-weight:600; color:var(--muted); margin-top:.25rem; }
#adm-root .upa-filter-bar { display:flex; align-items:center; gap:.8rem; margin-bottom:1.2rem; flex-wrap:wrap; }
#adm-root .upa-search-wrap { position:relative; flex:1; min-width:220px; }
#adm-root .upa-search-wrap svg { position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
#adm-root .upa-search-input { width:100%; padding:.65rem 1rem .65rem 2.5rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; transition:border-color .2s; }
#adm-root .upa-search-input:focus { border-color:var(--indigo); }
#adm-root .upa-cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:1.2rem; }
#adm-root .upa-card { background:var(--surface); border-radius:20px; border:1.5px solid var(--border); overflow:hidden; transition:transform .15s,box-shadow .15s; }
#adm-root .upa-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px rgba(99,102,241,.12); }
#adm-root .upa-card-header { padding:1.2rem 1.4rem; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; gap:.9rem; }
#adm-root .upa-card-icon { width:46px; height:46px; border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
#adm-root .upa-card-nome { font-family:'Nunito',sans-serif; font-size:1rem; font-weight:900; color:var(--text); line-height:1.2; }
#adm-root .upa-card-orgao { font-size:.7rem; font-weight:700; color:var(--muted); margin-top:3px; }
#adm-root .upa-badge { display:inline-flex; align-items:center; font-size:.65rem; font-weight:800; padding:.25rem .7rem; border-radius:20px; white-space:nowrap; }
#adm-root .upa-badge-ativo { background:var(--green-light); color:#16a34a; }
#adm-root .upa-badge-inativo { background:var(--red-light); color:#dc2626; }
#adm-root .upa-card-body { padding:1rem 1.4rem; }
#adm-root .upa-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; margin-bottom:.9rem; }
#adm-root .upa-info-item { background:var(--bg); border-radius:10px; padding:.5rem .7rem; }
#adm-root .upa-info-lbl { font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:2px; }
#adm-root .upa-info-val { font-family:'Nunito',sans-serif; font-size:.88rem; font-weight:900; color:var(--text); }
#adm-root .upa-turnos-wrap { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.9rem; }
#adm-root .upa-turno-chip { font-size:.68rem; font-weight:800; padding:.25rem .65rem; border-radius:20px; background:var(--indigo-light); color:var(--indigo); }
#adm-root .upa-geo-tag { display:flex; align-items:center; gap:.4rem; font-size:.72rem; font-weight:700; color:var(--muted); background:var(--bg); border-radius:8px; padding:.4rem .7rem; }
#adm-root .upa-geo-tag.ok { color:var(--teal); }
#adm-root .upa-card-footer { padding:.8rem 1.4rem; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
#adm-root .upa-footer-info { font-size:.7rem; font-weight:700; color:var(--muted); }
#adm-root .upa-card-actions { display:flex; gap:.4rem; }
#adm-root .upa-act-btn { width:30px; height:30px; border-radius:8px; border:1.5px solid var(--border); background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted); transition:all .15s; }
#adm-root .upa-act-btn:hover { border-color:var(--indigo); color:var(--indigo); background:var(--indigo-light); }
#adm-root .upa-act-danger:hover { border-color:var(--red); color:var(--red); background:var(--red-light); }
#adm-root .upa-act-activate:hover { border-color:var(--green); color:var(--green); background:var(--green-light); }
`;

// Note: CSS is split into two consts and merged at render time via UPAS_CSS + UPAS_CSS_DRAWER
const UPAS_CSS_DRAWER = `
#adm-root .upa-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; }
#adm-root .upa-drawer { position:fixed; top:0; right:0; bottom:0; width:540px; background:var(--surface); z-index:101; display:flex; flex-direction:column; box-shadow:-8px 0 40px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
#adm-root .upa-drawer.open { transform:translateX(0); }
#adm-root .upa-drawer-header { padding:1.4rem 1.6rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
#adm-root .upa-drawer-title { font-family:'Nunito',sans-serif; font-size:1.1rem; font-weight:900; color:var(--text); }
#adm-root .upa-drawer-close { background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; line-height:0; }
#adm-root .upa-drawer-close:hover { color:var(--text); }
#adm-root .upa-drawer-body { flex:1; overflow-y:auto; padding:1.6rem; }
#adm-root .upa-drawer-footer { padding:1.2rem 1.6rem; border-top:1px solid var(--border); display:flex; gap:.7rem; flex-shrink:0; }
#adm-root .upa-form-section { margin-bottom:1.4rem; }
#adm-root .upa-form-section-title { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--indigo); margin-bottom:.9rem; padding-bottom:.5rem; border-bottom:1.5px solid var(--indigo-light); }
#adm-root .upa-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; margin-bottom:.9rem; }
#adm-root .upa-form-row.full { grid-template-columns:1fr; }
#adm-root .upa-form-row.tri { grid-template-columns:1fr 1fr 1fr; }
#adm-root .upa-field { display:flex; flex-direction:column; gap:.35rem; }
#adm-root .upa-field label { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
#adm-root .upa-field input { padding:.7rem .9rem; border:1.5px solid var(--border); border-radius:10px; font-family:'Nunito Sans',sans-serif; font-size:.85rem; font-weight:600; color:var(--text); background:var(--bg); outline:none; transition:border-color .2s; }
#adm-root .upa-field input:focus { border-color:var(--indigo); background:#fff; }
#adm-root .upa-field-hint { font-size:.65rem; font-weight:600; color:var(--muted); }
#adm-root .upa-cep-loading { font-size:.62rem; font-weight:700; color:var(--teal); margin-left:.4rem; text-transform:none; letter-spacing:0; animation:upa-blink 1s ease infinite; }
@keyframes upa-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
#adm-root .upa-input-loading { border-color:var(--teal) !important; background-image:linear-gradient(90deg, transparent 0%, rgba(45,191,184,.06) 50%, transparent 100%); background-size:200% 100%; animation:upa-shimmer 1.2s linear infinite; }
@keyframes upa-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
#adm-root .upa-btn-geo { display:flex; align-items:center; gap:.5rem; padding:.65rem 1.1rem; border:1.5px solid var(--border); border-radius:10px; background:none; font-family:'Nunito',sans-serif; font-size:.82rem; font-weight:800; color:var(--teal); cursor:pointer; transition:all .15s; width:100%; justify-content:center; }
#adm-root .upa-btn-geo:hover { background:var(--teal-light); border-color:var(--teal); }
#adm-root .upa-btn-geo:disabled { opacity:.5; cursor:not-allowed; }
#adm-root .upa-toggle-row { display:flex; align-items:center; justify-content:space-between; padding:.7rem .9rem; background:var(--bg); border-radius:10px; }
#adm-root .upa-toggle-label { font-size:.82rem; font-weight:700; color:var(--text); }
#adm-root .upa-toggle-sub { font-size:.65rem; font-weight:600; color:var(--muted); margin-top:2px; }
#adm-root .upa-turnos-config { display:flex; flex-direction:column; gap:.5rem; }
#adm-root .upa-turno-config-row { display:flex; align-items:flex-start; gap:.8rem; padding:.65rem .9rem; background:var(--bg); border-radius:10px; border:1.5px solid transparent; transition:border-color .15s; }
#adm-root .upa-turno-config-row.enabled { border-color:rgba(99,102,241,.2); background:var(--indigo-light); }
#adm-root .upa-turno-config-info { flex:1; }
#adm-root .upa-turno-config-name { font-size:.82rem; font-weight:800; color:var(--text); display:block; }
#adm-root .upa-turno-config-off { font-size:.68rem; font-weight:600; color:var(--muted); }
#adm-root .upa-turno-config-fields { display:grid; grid-template-columns:1fr 1fr 80px; gap:.5rem; margin-top:.5rem; }
#adm-root .upa-turno-mini-field { display:flex; flex-direction:column; gap:.2rem; }
#adm-root .upa-turno-mini-field label { font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
#adm-root .upa-turno-mini-field input { padding:.45rem .6rem; border:1.5px solid var(--border); border-radius:8px; font-family:'Nunito Sans',sans-serif; font-size:.78rem; font-weight:600; color:var(--text); background:var(--surface); outline:none; width:100%; }
#adm-root .upa-turno-mini-field input:focus { border-color:var(--indigo); }
#adm-root .upa-turno-section-label { font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--purple); margin:.7rem 0 .4rem; padding-left:.2rem; }
#adm-root .upa-toggle-wrap { position:relative; width:42px; height:24px; flex-shrink:0; cursor:pointer; }
#adm-root .upa-toggle-wrap input { opacity:0; width:0; height:0; }
#adm-root .upa-toggle-slider { position:absolute; inset:0; background:#d1d5db; border-radius:24px; cursor:pointer; transition:background .2s; }
#adm-root .upa-toggle-slider::before { content:''; position:absolute; width:18px; height:18px; background:#fff; border-radius:50%; top:3px; left:3px; transition:transform .2s; box-shadow:0 1px 4px rgba(0,0,0,.2); }
#adm-root .upa-toggle-wrap input:checked + .upa-toggle-slider { background:var(--indigo); }
#adm-root .upa-toggle-wrap input:checked + .upa-toggle-slider::before { transform:translateX(18px); }
#adm-root .upa-btn-salvar { flex:1; padding:.85rem; border:none; border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:800; color:#fff; cursor:pointer; background:linear-gradient(135deg,var(--indigo),var(--indigo-dark)); box-shadow:0 3px 12px rgba(99,102,241,.3); transition:transform .14s; }
#adm-root .upa-btn-salvar:hover { transform:translateY(-1px); }
#adm-root .upa-btn-salvar:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
#adm-root .upa-btn-cancelar { padding:.85rem 1.2rem; border:1.5px solid var(--border); border-radius:12px; font-family:'Nunito',sans-serif; font-size:.9rem; font-weight:700; color:var(--muted); cursor:pointer; background:none; transition:border-color .15s; }
#adm-root .upa-btn-cancelar:hover { border-color:var(--indigo); color:var(--indigo); }
#adm-root .upa-toast { position:fixed; bottom:2rem; right:2rem; background:#1a1f36; color:#fff; border-radius:12px; padding:.9rem 1.4rem; font-size:.82rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2); transform:translateY(80px); opacity:0; transition:transform .3s ease,opacity .3s ease; z-index:200; }
#adm-root .upa-toast.show { transform:translateY(0); opacity:1; }
#adm-root .upa-toast.error { background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; }
#adm-root .upa-cselect { position:relative; }
#adm-root .upa-cselect-btn { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.65rem 1rem .65rem .9rem; border:1.5px solid var(--border); border-radius:12px; background:var(--surface); font-family:'Nunito Sans',sans-serif; font-size:.82rem; font-weight:700; color:var(--text); cursor:pointer; transition:border-color .2s; white-space:nowrap; width:100%; }
#adm-root .upa-field .upa-cselect-btn { padding:.7rem .9rem; border-radius:10px; background:var(--bg); font-size:.85rem; }
#adm-root .upa-field .upa-cselect { width:100%; }
#adm-root .upa-cselect-btn:hover { border-color:var(--indigo); }
#adm-root .upa-cselect-btn svg { color:var(--indigo); flex-shrink:0; }
#adm-root .upa-cselect-dropdown { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; background:var(--surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:60; overflow:hidden; animation:fadeUp .15s ease; }
#adm-root .upa-cselect-option { padding:.6rem 1rem; font-size:.8rem; font-weight:600; color:var(--text); cursor:pointer; transition:background .12s; }
#adm-root .upa-cselect-option:hover { background:var(--indigo-light); color:var(--indigo); }
#adm-root .upa-cselect-option.active { background:var(--indigo); color:#fff; font-weight:800; }
#adm-root.dark .upa-topbar { background:#1a1f36; border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .upa-kpi { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .upa-search-input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .upa-card { background:#1a1f36; border-color:rgba(255,255,255,.08); }
#adm-root.dark .upa-card:hover { box-shadow:0 8px 24px rgba(0,0,0,.3); }
#adm-root.dark .upa-card-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .upa-info-item { background:#0f1119; }
#adm-root.dark .upa-card-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .upa-drawer { background:#1a1f36; }
#adm-root.dark .upa-drawer-header { border-bottom-color:rgba(255,255,255,.06); }
#adm-root.dark .upa-drawer-footer { border-top-color:rgba(255,255,255,.06); }
#adm-root.dark .upa-field input { background-color:#0f1119; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .upa-field input:focus { border-color:var(--indigo); background-color:#0f1119; }
#adm-root.dark .upa-field input::placeholder { color:#64748b; }
#adm-root.dark .upa-toggle-row { background:#0f1119; }
#adm-root.dark .upa-turno-config-row { background:#0f1119; }
#adm-root.dark .upa-turno-config-row.enabled { background:rgba(99,102,241,.1); border-color:rgba(99,102,241,.3); }
#adm-root.dark .upa-turno-mini-field input { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .upa-turno-mini-field input:focus { border-color:var(--indigo); }
#adm-root.dark .upa-form-section-title { border-bottom-color:rgba(99,102,241,.2); }
#adm-root.dark .upa-cselect-btn { background:#1a1f36; border-color:rgba(255,255,255,.1); color:#e2e8f0; }
#adm-root.dark .upa-field .upa-cselect-btn { background:#0f1119; }
#adm-root.dark .upa-cselect-dropdown { background:#1a1f36; border-color:rgba(255,255,255,.1); box-shadow:0 8px 24px rgba(0,0,0,.4); }
#adm-root.dark .upa-cselect-option { color:#e2e8f0; }
#adm-root.dark .upa-cselect-option:hover { background:rgba(99,102,241,.15); color:#a5b4fc; }
#adm-root.dark .upa-cselect-option.active { background:var(--indigo); color:#fff; }
`;

// Styles are merged in the component's style tag: UPAS_CSS + UPAS_CSS_DRAWER
