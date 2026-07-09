import { useRetryQueue } from '../hooks/useRetryQueue';

/**
 * Displays a badge/indicator showing the number of pending offline operations.
 * Only visible when there are operations in the retry queue.
 *
 * @see Requirement 9.2
 */
export function PendingOperationsIndicator() {
  const { pendingCount } = useRetryQueue();

  if (pendingCount === 0) {
    return null;
  }

  return (
    <span
      role="status"
      aria-label={`${pendingCount} operação${pendingCount > 1 ? 'ões' : ''} pendente${pendingCount > 1 ? 's' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        backgroundColor: '#ff9800',
        color: '#fff',
        borderRadius: 12,
        fontSize: '0.8rem',
        fontWeight: 600,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: '#fff',
          animation: 'pulse 1.5s infinite',
        }}
      />
      {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
    </span>
  );
}
