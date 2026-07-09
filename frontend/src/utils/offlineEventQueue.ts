/**
 * Offline Event Queue - Stores check-in/check-out events locally
 * when the device is offline, for later synchronization.
 *
 * Uses localStorage for persistence. Events are stored with sync status
 * tracking, retry count, and timestamps for last sync attempt.
 *
 * @see Task 10.1 - Criar fila local de eventos offline no mobile
 */

import type {
  OfflineAttendanceEvent,
  AttendanceType,
  SyncStatus,
} from '../types/offlineEvent';

// --- Constants ---

const STORAGE_KEY = 'plantonhub_offline_events';
const DEVICE_ID_KEY = 'plantonhub_device_id';
const APP_VERSION = '1.0.0';

// --- UUID Generation ---

/**
 * Generates a UUID v4 string.
 * Uses crypto.randomUUID when available, falls back to manual generation.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Device ID ---

/**
 * Gets or creates a persistent device ID stored in localStorage.
 * The device ID remains constant across sessions on the same device/browser.
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

// --- Storage Helpers ---

/**
 * Reads all offline events from localStorage.
 */
function readEvents(): OfflineAttendanceEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineAttendanceEvent[];
  } catch {
    return [];
  }
}

/**
 * Writes the events array to localStorage.
 */
function writeEvents(events: OfflineAttendanceEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// --- Public API ---

export interface CreateOfflineEventInput {
  userId: string;
  clinicId: string;
  shiftId: string;
  attendanceType: AttendanceType;
  latitude: number;
  longitude: number;
  biometricValidated: boolean;
}

/**
 * Creates and stores a new offline attendance event.
 * Generates a LocalEventId (UUID) and sets initial sync status to Pending.
 *
 * @returns The created event with all fields populated
 */
export function createOfflineEvent(input: CreateOfflineEventInput): OfflineAttendanceEvent {
  const event: OfflineAttendanceEvent = {
    localEventId: generateUUID(),
    userId: input.userId,
    clinicId: input.clinicId,
    shiftId: input.shiftId,
    attendanceType: input.attendanceType,
    localDateTime: new Date().toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    deviceId: getDeviceId(),
    appVersion: APP_VERSION,
    biometricValidated: input.biometricValidated,
    syncStatus: 'Pending',
    retryCount: 0,
    lastSyncAttemptAt: null,
  };

  const events = readEvents();
  events.push(event);
  writeEvents(events);

  return event;
}

/**
 * Returns all stored offline events.
 */
export function getAllOfflineEvents(): OfflineAttendanceEvent[] {
  return readEvents();
}

/**
 * Returns only events with a specific sync status.
 */
export function getEventsByStatus(status: SyncStatus): OfflineAttendanceEvent[] {
  return readEvents().filter((e) => e.syncStatus === status);
}

/**
 * Returns the count of pending events (not yet synced).
 */
export function getPendingCount(): number {
  return readEvents().filter((e) => e.syncStatus === 'Pending').length;
}

/**
 * Retrieves a single event by its LocalEventId.
 */
export function getEventById(localEventId: string): OfflineAttendanceEvent | undefined {
  return readEvents().find((e) => e.localEventId === localEventId);
}

/**
 * Updates the sync status of an event.
 * Also updates retryCount and lastSyncAttemptAt when appropriate.
 */
export function updateEventSyncStatus(
  localEventId: string,
  syncStatus: SyncStatus
): boolean {
  const events = readEvents();
  const index = events.findIndex((e) => e.localEventId === localEventId);
  if (index === -1) return false;

  events[index].syncStatus = syncStatus;
  events[index].lastSyncAttemptAt = new Date().toISOString();

  if (syncStatus === 'Failed') {
    events[index].retryCount += 1;
  }

  writeEvents(events);
  return true;
}

/**
 * Removes a synced event from localStorage.
 * Typically called after successful sync confirmation.
 */
export function removeEvent(localEventId: string): boolean {
  const events = readEvents();
  const index = events.findIndex((e) => e.localEventId === localEventId);
  if (index === -1) return false;

  events.splice(index, 1);
  writeEvents(events);
  return true;
}

/**
 * Removes all events that have been successfully synced.
 * Useful for periodic cleanup.
 */
export function removeSyncedEvents(): number {
  const events = readEvents();
  const remaining = events.filter((e) => e.syncStatus !== 'Synced');
  const removedCount = events.length - remaining.length;
  writeEvents(remaining);
  return removedCount;
}

/**
 * Clears all offline events from storage.
 * Use with caution — typically only on logout or data reset.
 */
export function clearAllOfflineEvents(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Marks a batch of events as synced and removes them from storage.
 * Used after successful batch synchronization.
 */
export function markEventsSynced(localEventIds: string[]): number {
  const events = readEvents();
  const idsSet = new Set(localEventIds);
  const remaining = events.filter((e) => !idsSet.has(e.localEventId));
  const syncedCount = events.length - remaining.length;
  writeEvents(remaining);
  return syncedCount;
}

/**
 * Increments the retry count and updates lastSyncAttemptAt for a batch of events
 * that failed to sync. Sets their status to 'Failed'.
 */
export function markEventsFailed(localEventIds: string[]): void {
  const events = readEvents();
  const idsSet = new Set(localEventIds);
  const now = new Date().toISOString();

  for (const event of events) {
    if (idsSet.has(event.localEventId)) {
      event.syncStatus = 'Failed';
      event.retryCount += 1;
      event.lastSyncAttemptAt = now;
    }
  }

  writeEvents(events);
}

/**
 * Resets failed events back to Pending status so they can be retried.
 */
export function resetFailedEvents(): number {
  const events = readEvents();
  let resetCount = 0;

  for (const event of events) {
    if (event.syncStatus === 'Failed') {
      event.syncStatus = 'Pending';
      resetCount++;
    }
  }

  writeEvents(events);
  return resetCount;
}
