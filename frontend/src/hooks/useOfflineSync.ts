import { useCallback, useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { attendanceApi, type SyncEventResult } from '../api/attendanceApi';
import {
  getAllOfflineEvents,
  getEventsByStatus,
  markEventsSynced,
  markEventsFailed,
  updateEventSyncStatus,
  createOfflineEvent,
  type CreateOfflineEventInput,
} from '../utils/offlineEventQueue';
import type { OfflineAttendanceEvent } from '../types/offlineEvent';

export interface OfflineSyncState {
  /** All offline events in localStorage */
  events: OfflineAttendanceEvent[];
  /** Whether a sync operation is currently in progress */
  isSyncing: boolean;
  /** Results from the last sync attempt */
  lastSyncResults: SyncEventResult[] | null;
  /** Error from the last sync attempt */
  lastSyncError: string | null;
}

/**
 * Hook that manages offline event synchronization.
 * - Auto-syncs when coming back online
 * - Provides manual sync trigger
 * - Enqueues events when offline
 */
export function useOfflineSync() {
  const { isOnline } = useNetworkStatus();
  const [events, setEvents] = useState<OfflineAttendanceEvent[]>(getAllOfflineEvents);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResults, setLastSyncResults] = useState<SyncEventResult[] | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const prevOnlineRef = useRef(isOnline);

  /** Refresh the events list from localStorage */
  const refreshEvents = useCallback(() => {
    setEvents(getAllOfflineEvents());
  }, []);

  /**
   * Enqueue a check-in or check-out event for offline storage.
   */
  const enqueueOfflineEvent = useCallback((input: CreateOfflineEventInput) => {
    const event = createOfflineEvent(input);
    refreshEvents();
    return event;
  }, [refreshEvents]);

  /**
   * Sync all pending/failed events with the backend via POST /api/attendance/sync.
   */
  const syncPendingEvents = useCallback(async () => {
    const pending = getEventsByStatus('Pending');
    const failed = getEventsByStatus('Failed');
    const toSync = [...pending, ...failed];

    if (toSync.length === 0) return;

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const response = await attendanceApi.syncOfflineEvents(toSync);
      const { results } = response;

      // Process results
      const syncedIds: string[] = [];

      for (const result of results) {
        if (result.status === 'Synced' || result.status === 'DuplicateIgnored') {
          syncedIds.push(result.localEventId);
        } else if (result.status === 'Rejected') {
          // Mark as failed with specific message — remove from queue
          updateEventSyncStatus(result.localEventId, 'Failed');
        } else if (result.status === 'RequiresReview') {
          // Mark as synced (it was accepted, just flagged)
          syncedIds.push(result.localEventId);
        }
      }

      if (syncedIds.length > 0) {
        markEventsSynced(syncedIds);
      }

      setLastSyncResults(results);
      refreshEvents();
    } catch (err: unknown) {
      // Network error during sync — mark all as failed for retry
      const pendingIds = [...pending, ...failed].map((e) => e.localEventId);
      markEventsFailed(pendingIds);
      const msg = err instanceof Error ? err.message : 'Erro ao sincronizar eventos offline.';
      setLastSyncError(msg);
      refreshEvents();
    } finally {
      setIsSyncing(false);
    }
  }, [refreshEvents]);

  // Auto-sync when going from offline to online
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      // Just came back online
      void syncPendingEvents();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, syncPendingEvents]);

  return {
    events,
    isSyncing,
    lastSyncResults,
    lastSyncError,
    enqueueOfflineEvent,
    syncPendingEvents,
    refreshEvents,
  };
}
