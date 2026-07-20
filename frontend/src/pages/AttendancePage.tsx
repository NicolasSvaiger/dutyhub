import { useEffect, useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useAuth } from '../hooks/useAuth';
import { useClinic } from '../hooks/useClinic';
import { ManualSyncButton } from '../components/ManualSyncButton';
import { PendingOperationsList } from '../components/PendingOperationsList';
import axiosInstance from '../api/axiosInstance';
import type { Attendance, Shift } from '../types';
import { isNetworkError } from '../utils/networkError';
import { formatDateTimeBR } from '../utils/dateTimeBR';

export function AttendancePage() {
  const { getCurrentPosition, loading: geoLoading, error: geoError } = useGeolocation();
  const { isOnline } = useNetworkStatus();
  const { user } = useAuth();
  const { activeClinic } = useClinic();
  const {
    events: offlineEvents,
    isSyncing,
    lastSyncError,
    enqueueOfflineEvent,
    syncPendingEvents,
  } = useOfflineSync();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState('');

  const pendingEvents = offlineEvents.filter(
    (e) => e.syncStatus === 'Pending' || e.syncStatus === 'Failed'
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shiftsRes, historyRes] = await Promise.all([
        axiosInstance.get<Shift[]>('/shifts'),
        axiosInstance.get<Attendance[]>('/attendance/my-history'),
      ]);
      setShifts(shiftsRes.data);
      setHistory(historyRes.data);
      if (shiftsRes.data.length > 0 && !selectedShiftId) {
        setSelectedShiftId(shiftsRes.data[0].id);
      }
    } catch {
      setError('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleCheckIn = async () => {
    if (!selectedShiftId) return;
    setActionLoading(true);
    setMessage(null);
    setError(null);

    let position: { latitude: number; longitude: number };
    try {
      position = await getCurrentPosition();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao obter localização.';
      setError(msg);
      setActionLoading(false);
      return;
    }

    // If offline, enqueue to localStorage directly
    if (!isOnline) {
      enqueueOfflineEvent({
        userId: user?.userId ?? '',
        clinicId: activeClinic?.id ?? '',
        shiftId: selectedShiftId,
        attendanceType: 'CheckIn',
        latitude: position.latitude,
        longitude: position.longitude,
        biometricValidated: false,
      });
      setMessage('Check-in salvo offline. Será sincronizado quando a conexão voltar.');
      setActionLoading(false);
      return;
    }

    try {
      await axiosInstance.post('/attendance/check-in', {
        shiftId: selectedShiftId,
        latitude: position.latitude,
        longitude: position.longitude,
        deviceId: navigator.userAgent.slice(0, 100),
        biometricValidated: false,
      });
      setMessage('Check-in realizado com sucesso!');
      void fetchData();
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        // Network failed — enqueue offline
        enqueueOfflineEvent({
          userId: user?.userId ?? '',
          clinicId: activeClinic?.id ?? '',
          shiftId: selectedShiftId,
          attendanceType: 'CheckIn',
          latitude: position.latitude,
          longitude: position.longitude,
          biometricValidated: false,
        });
        setMessage('Sem conexão. Check-in salvo offline para sincronização posterior.');
      } else {
        const msg =
          err instanceof Error ? err.message : 'Erro ao realizar check-in.';
        setError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedShiftId) return;
    setActionLoading(true);
    setMessage(null);
    setError(null);

    let position: { latitude: number; longitude: number };
    try {
      position = await getCurrentPosition();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao obter localização.';
      setError(msg);
      setActionLoading(false);
      return;
    }

    // If offline, enqueue to localStorage directly
    if (!isOnline) {
      enqueueOfflineEvent({
        userId: user?.userId ?? '',
        clinicId: activeClinic?.id ?? '',
        shiftId: selectedShiftId,
        attendanceType: 'CheckOut',
        latitude: position.latitude,
        longitude: position.longitude,
        biometricValidated: false,
      });
      setMessage('Check-out salvo offline. Será sincronizado quando a conexão voltar.');
      setActionLoading(false);
      return;
    }

    try {
      await axiosInstance.post('/attendance/check-out', {
        shiftId: selectedShiftId,
        latitude: position.latitude,
        longitude: position.longitude,
        deviceId: navigator.userAgent.slice(0, 100),
      });
      setMessage('Check-out realizado com sucesso!');
      void fetchData();
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        // Network failed — enqueue offline
        enqueueOfflineEvent({
          userId: user?.userId ?? '',
          clinicId: activeClinic?.id ?? '',
          shiftId: selectedShiftId,
          attendanceType: 'CheckOut',
          latitude: position.latitude,
          longitude: position.longitude,
          biometricValidated: false,
        });
        setMessage('Sem conexão. Check-out salvo offline para sincronização posterior.');
      } else {
        const msg =
          err instanceof Error ? err.message : 'Erro ao realizar check-out.';
        setError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}><p>Carregando...</p></div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Presença</h1>

      <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Registrar Presença</h2>

        {!isOnline && (
          <p style={{ color: '#e65100', marginBottom: 12, fontSize: '0.9rem' }}>
            ⚠️ Modo offline ativo. Operações serão salvas localmente.
          </p>
        )}

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="shift-select" style={{ display: 'block', marginBottom: 4 }}>
            Plantão
          </label>
          <select
            id="shift-select"
            value={selectedShiftId}
            onChange={(e) => setSelectedShiftId(e.target.value)}
            style={{ padding: 8, minWidth: 200 }}
          >
            {shifts.length === 0 && <option value="">Nenhum plantão disponível</option>}
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} - {s.date}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={actionLoading || geoLoading || !selectedShiftId}
            style={{ padding: '8px 20px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {actionLoading ? 'Processando...' : 'Check-in'}
          </button>
          <button
            type="button"
            onClick={handleCheckOut}
            disabled={actionLoading || geoLoading || !selectedShiftId}
            style={{ padding: '8px 20px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {actionLoading ? 'Processando...' : 'Check-out'}
          </button>
          <ManualSyncButton
            isSyncing={isSyncing}
            pendingCount={pendingEvents.length}
            onSync={syncPendingEvents}
          />
        </div>

        {geoError && <p style={{ color: 'orange', marginTop: 8 }}>{geoError}</p>}
        {message && <p style={{ color: 'green', marginTop: 8 }}>{message}</p>}
        {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
        {lastSyncError && <p style={{ color: 'red', marginTop: 8 }}>Erro na sincronização: {lastSyncError}</p>}
      </div>

      {/* Pending offline operations list */}
      <PendingOperationsList events={pendingEvents} />

      <h2 style={{ marginTop: 24 }}>Histórico de Presença</h2>
      {history.length === 0 ? (
        <p>Nenhum registro encontrado.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Plantão</th>
              <th style={{ padding: 8 }}>Check-in</th>
              <th style={{ padding: 8 }}>Check-out</th>
            </tr>
          </thead>
          <tbody>
            {history.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{a.shiftId}</td>
                <td style={{ padding: 8 }}>{formatDateTimeBR(a.checkInTime)}</td>
                <td style={{ padding: 8 }}>
                  {a.checkOutTime ? formatDateTimeBR(a.checkOutTime) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
