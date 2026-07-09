import { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { attendanceApi } from '../api/attendanceApi';
import { useRetryQueue } from '../hooks/useRetryQueue';
import { isNetworkError } from '../utils/networkError';

interface CheckOutButtonProps {
  shiftId: string;
  onSuccess?: () => void;
}

export function CheckOutButton({ shiftId, onSuccess }: CheckOutButtonProps) {
  const { getCurrentPosition } = useGeolocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const { enqueue, pendingCount } = useRetryQueue();

  const handleCheckOut = async () => {
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
    };

    try {
      await attendanceApi.checkOut(payload);
      onSuccess?.();
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        // Network error - enqueue for retry
        const result = enqueue({ type: 'check-out', payload });
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
          (err instanceof Error ? err.message : 'Erro ao realizar check-out.');
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
        onClick={handleCheckOut}
        disabled={loading || !shiftId}
        style={{
          padding: '8px 20px',
          backgroundColor: '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Processando...' : 'Check-out'}
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
