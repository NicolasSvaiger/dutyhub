interface ManualSyncButtonProps {
  isSyncing: boolean;
  pendingCount: number;
  onSync: () => void;
}

/**
 * Button that triggers manual synchronization of offline events.
 * Disabled when there's nothing to sync or a sync is already in progress.
 */
export function ManualSyncButton({ isSyncing, pendingCount, onSync }: ManualSyncButtonProps) {
  const disabled = isSyncing || pendingCount === 0;

  return (
    <button
      type="button"
      onClick={onSync}
      disabled={disabled}
      aria-label="Sincronizar operações pendentes"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        backgroundColor: disabled ? '#bdbdbd' : '#1976d2',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.85rem',
        fontWeight: 500,
      }}
    >
      {isSyncing ? (
        <>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span>
          Sincronizando...
        </>
      ) : (
        <>
          🔄 Sincronizar ({pendingCount})
        </>
      )}
    </button>
  );
}
