import type { OfflineAttendanceEvent } from '../types/offlineEvent';
import { formatDateTimeBR } from '../utils/dateTimeBR';

interface PendingOperationsListProps {
  events: OfflineAttendanceEvent[];
}

function getStatusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'Pending':
      return { label: 'Pendente', color: '#e65100', bg: '#fff3e0' };
    case 'Synced':
      return { label: 'Sincronizado', color: '#2e7d32', bg: '#e8f5e9' };
    case 'Failed':
      return { label: 'Falhou', color: '#c62828', bg: '#ffebee' };
    default:
      return { label: status, color: '#616161', bg: '#f5f5f5' };
  }
}

function formatDateTime(iso: string): string {
  try {
    return formatDateTimeBR(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/**
 * Displays a list of pending offline operations with their individual sync status.
 * Only renders when there are events to display.
 */
export function PendingOperationsList({ events }: PendingOperationsListProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        backgroundColor: '#fafafa',
      }}
    >
      <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#424242' }}>
        Operações Offline Pendentes ({events.length})
      </h3>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {events.map((event) => {
          const badge = getStatusBadge(event.syncStatus);
          return (
            <li
              key={event.localEventId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: '#fff',
                borderRadius: 4,
                border: '1px solid #eeeeee',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>
                  {event.attendanceType === 'CheckIn' ? '🟢 Check-in' : '🔴 Check-out'}
                </span>
                <span style={{ color: '#757575' }}>
                  {formatDateTime(event.localDateTime)}
                </span>
                {event.retryCount > 0 && (
                  <span style={{ color: '#9e9e9e', fontSize: '0.8rem' }}>
                    ({event.retryCount} tentativa{event.retryCount > 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: badge.color,
                  backgroundColor: badge.bg,
                }}
              >
                {badge.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
