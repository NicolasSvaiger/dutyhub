import { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { attendanceApi } from '../api/attendanceApi';
import { useRetryQueue } from '../hooks/useRetryQueue';
import { isNetworkError } from '../utils/networkError';

interface CheckInButtonProps {
  shiftId: string;
  onSuccess?: () => void;
}

export function CheckInButton({ shiftId, onSuccess }: CheckInButtonProps) {
  const { getCurrentPosition } = useGeolocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const { enqueue, pendingCount } = useRetryQueue();

  const handleCheckIn = async () => {
    setLoading(true);
    setError(null);
    setQueued(false);

    let position: { latitude: number; longitude: number };
    try {
      position = await getCurrentPosition();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao obter localização.';
      setError(msg);
      setLoading(false);
      return;
    }

    const payload = {
      shiftId,
      latitude: position.latitude,
      longitude: position.longitude,
      deviceId: navigator.userAgent.slice(0, 100),
      biometricValidated: false,
    };

    try {
      await attendanceApi.checkIn(payload);
      onSuccess?.();
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        // Network error - enqueue for retry
        const result = enqueue({ type: 'check-in', payload });
        if (result.success) {
          setQueued(true);
        } else {
          setError(result.reason || 'Fila de retry cheia.');
        }
      } else {
        // Business error (4xx) - show error details to user
        const axiosErr = err as { response?: { data?: { message?: string }; status?: number }; message?: string };
        const msg =
          axiosErr.response?.data?.message ||
          (err instanceof Error ? err.message : 'Erro ao realizar check-in.');
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <span>
      <button
        type="button"
        onClick={handleCheckIn}
        disabled={loading || !shiftId}
        style={{
          padding: '8px 20px',
          backgroundColor: '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Processando...' : 'Check-in'}
      </button>
      {queued && (
        <span style={{ color: '#ff9800', marginLeft: 8 }}>
          ⏳ Operação enfileirada (offline). Será reenviada automaticamente.
        </span>
      )}
      {pendingCount > 0 && !queued && (
        <span style={{ color: '#ff9800', marginLeft: 8, fontSize: '0.85em' }}>
          ({pendingCount} pendente{pendingCount > 1 ? 's' : ''})
        </span>
      )}
      {error && <span style={{ color: 'red', marginLeft: 8 }}>{error}</span>}
    </span>
  );
}
