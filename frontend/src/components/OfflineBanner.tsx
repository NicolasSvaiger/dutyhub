import { useNetworkStatus } from '../hooks/useNetworkStatus';

/**
 * Visual banner displayed when the app detects the device is offline.
 * Shows at the top of the page with a warning color scheme.
 */
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 16px',
        backgroundColor: '#e65100',
        color: '#fff',
        fontSize: '0.9rem',
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>⚠️</span>
      <span>
        Sem conexão com a internet. Operações serão salvas localmente e sincronizadas quando a conexão voltar.
      </span>
    </div>
  );
}
