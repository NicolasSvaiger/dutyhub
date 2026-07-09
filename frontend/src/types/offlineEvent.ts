/**
 * Types for offline attendance events (check-in/check-out)
 * stored locally when the device is offline.
 *
 * These events are queued for synchronization when connectivity is restored.
 */

/** Attendance operation type */
export type AttendanceType = 'CheckIn' | 'CheckOut';

/** Synchronization status of an offline event */
export type SyncStatus = 'Pending' | 'Synced' | 'Failed';

/**
 * Represents a check-in or check-out event captured offline.
 * Stored in localStorage until successfully synced with the server.
 */
export interface OfflineAttendanceEvent {
  /** UUID generated on the device at event creation */
  localEventId: string;
  /** ID of the user performing the attendance */
  userId: string;
  /** ID of the clinic where the attendance is being recorded */
  clinicId: string;
  /** ID of the shift associated with this attendance */
  shiftId: string;
  /** Whether this is a check-in or check-out */
  attendanceType: AttendanceType;
  /** ISO 8601 timestamp of the device's local time when event occurred */
  localDateTime: string;
  /** GPS latitude of the device */
  latitude: number;
  /** GPS longitude of the device */
  longitude: number;
  /** Unique identifier for the device */
  deviceId: string;
  /** Version of the app that created this event */
  appVersion: string;
  /** Whether biometric validation was performed on the device */
  biometricValidated: boolean;
  /** Current sync status of this event */
  syncStatus: SyncStatus;
  /** Number of sync attempts made */
  retryCount: number;
  /** ISO 8601 timestamp of the last sync attempt, or null if never attempted */
  lastSyncAttemptAt: string | null;
}
