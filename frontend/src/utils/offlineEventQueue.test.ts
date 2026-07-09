/**
 * Tests for offlineEventQueue module.
 *
 * Tests cover CRUD operations, sync status management,
 * device ID persistence, and UUID generation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createOfflineEvent,
  getAllOfflineEvents,
  getEventsByStatus,
  getPendingCount,
  getEventById,
  updateEventSyncStatus,
  removeEvent,
  removeSyncedEvents,
  clearAllOfflineEvents,
  markEventsSynced,
  markEventsFailed,
  resetFailedEvents,
  generateUUID,
  getDeviceId,
  type CreateOfflineEventInput,
} from './offlineEventQueue';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

function makeInput(overrides?: Partial<CreateOfflineEventInput>): CreateOfflineEventInput {
  return {
    userId: 'user-123',
    clinicId: 'clinic-456',
    shiftId: 'shift-789',
    attendanceType: 'CheckIn',
    latitude: -23.5505,
    longitude: -46.6333,
    biometricValidated: true,
    ...overrides,
  };
}

describe('offlineEventQueue', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('generateUUID', () => {
    it('generates a string in UUID format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates unique UUIDs', () => {
      const uuids = new Set(Array.from({ length: 100 }, () => generateUUID()));
      expect(uuids.size).toBe(100);
    });
  });

  describe('getDeviceId', () => {
    it('generates and persists a device ID', () => {
      const deviceId = getDeviceId();
      expect(deviceId).toBeTruthy();
      expect(deviceId.length).toBeGreaterThan(0);

      // Should return same ID on subsequent calls
      const deviceId2 = getDeviceId();
      expect(deviceId2).toBe(deviceId);
    });

    it('returns existing device ID from localStorage', () => {
      localStorageMock.setItem('plantonhub_device_id', 'existing-device-id');
      const deviceId = getDeviceId();
      expect(deviceId).toBe('existing-device-id');
    });
  });

  describe('createOfflineEvent', () => {
    it('creates an event with all required fields', () => {
      const input = makeInput();
      const event = createOfflineEvent(input);

      expect(event.localEventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(event.userId).toBe('user-123');
      expect(event.clinicId).toBe('clinic-456');
      expect(event.shiftId).toBe('shift-789');
      expect(event.attendanceType).toBe('CheckIn');
      expect(event.localDateTime).toBeTruthy();
      expect(event.latitude).toBe(-23.5505);
      expect(event.longitude).toBe(-46.6333);
      expect(event.deviceId).toBeTruthy();
      expect(event.appVersion).toBe('1.0.0');
      expect(event.biometricValidated).toBe(true);
      expect(event.syncStatus).toBe('Pending');
      expect(event.retryCount).toBe(0);
      expect(event.lastSyncAttemptAt).toBeNull();
    });

    it('persists event to localStorage', () => {
      createOfflineEvent(makeInput());
      const events = getAllOfflineEvents();
      expect(events).toHaveLength(1);
    });

    it('generates unique localEventId for each event', () => {
      const event1 = createOfflineEvent(makeInput());
      const event2 = createOfflineEvent(makeInput());
      expect(event1.localEventId).not.toBe(event2.localEventId);
    });

    it('uses consistent deviceId across events', () => {
      const event1 = createOfflineEvent(makeInput());
      const event2 = createOfflineEvent(makeInput());
      expect(event1.deviceId).toBe(event2.deviceId);
    });

    it('stores localDateTime as ISO 8601 string', () => {
      const before = new Date().toISOString();
      const event = createOfflineEvent(makeInput());
      const after = new Date().toISOString();

      expect(event.localDateTime >= before).toBe(true);
      expect(event.localDateTime <= after).toBe(true);
    });
  });

  describe('getAllOfflineEvents', () => {
    it('returns empty array when no events exist', () => {
      expect(getAllOfflineEvents()).toEqual([]);
    });

    it('returns all stored events', () => {
      createOfflineEvent(makeInput());
      createOfflineEvent(makeInput({ attendanceType: 'CheckOut' }));
      expect(getAllOfflineEvents()).toHaveLength(2);
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorageMock.setItem('plantonhub_offline_events', 'not valid json');
      expect(getAllOfflineEvents()).toEqual([]);
    });
  });

  describe('getEventsByStatus', () => {
    it('filters events by sync status', () => {
      const event1 = createOfflineEvent(makeInput());
      createOfflineEvent(makeInput());

      updateEventSyncStatus(event1.localEventId, 'Synced');

      const pending = getEventsByStatus('Pending');
      const synced = getEventsByStatus('Synced');
      expect(pending).toHaveLength(1);
      expect(synced).toHaveLength(1);
    });
  });

  describe('getPendingCount', () => {
    it('returns count of pending events only', () => {
      const event1 = createOfflineEvent(makeInput());
      createOfflineEvent(makeInput());

      expect(getPendingCount()).toBe(2);

      updateEventSyncStatus(event1.localEventId, 'Synced');
      expect(getPendingCount()).toBe(1);
    });
  });

  describe('getEventById', () => {
    it('retrieves event by localEventId', () => {
      const created = createOfflineEvent(makeInput());
      const found = getEventById(created.localEventId);
      expect(found).toBeDefined();
      expect(found!.localEventId).toBe(created.localEventId);
    });

    it('returns undefined for non-existent ID', () => {
      expect(getEventById('non-existent')).toBeUndefined();
    });
  });

  describe('updateEventSyncStatus', () => {
    it('updates sync status to Synced', () => {
      const event = createOfflineEvent(makeInput());
      const result = updateEventSyncStatus(event.localEventId, 'Synced');
      expect(result).toBe(true);

      const updated = getEventById(event.localEventId);
      expect(updated!.syncStatus).toBe('Synced');
      expect(updated!.lastSyncAttemptAt).toBeTruthy();
    });

    it('increments retryCount on Failed status', () => {
      const event = createOfflineEvent(makeInput());

      updateEventSyncStatus(event.localEventId, 'Failed');
      let updated = getEventById(event.localEventId);
      expect(updated!.retryCount).toBe(1);

      updateEventSyncStatus(event.localEventId, 'Failed');
      updated = getEventById(event.localEventId);
      expect(updated!.retryCount).toBe(2);
    });

    it('sets lastSyncAttemptAt timestamp', () => {
      const event = createOfflineEvent(makeInput());
      const before = new Date().toISOString();
      updateEventSyncStatus(event.localEventId, 'Synced');
      const after = new Date().toISOString();

      const updated = getEventById(event.localEventId);
      expect(updated!.lastSyncAttemptAt! >= before).toBe(true);
      expect(updated!.lastSyncAttemptAt! <= after).toBe(true);
    });

    it('returns false for non-existent event', () => {
      expect(updateEventSyncStatus('non-existent', 'Synced')).toBe(false);
    });
  });

  describe('removeEvent', () => {
    it('removes event by localEventId', () => {
      const event = createOfflineEvent(makeInput());
      expect(removeEvent(event.localEventId)).toBe(true);
      expect(getAllOfflineEvents()).toHaveLength(0);
    });

    it('returns false for non-existent event', () => {
      expect(removeEvent('non-existent')).toBe(false);
    });
  });

  describe('removeSyncedEvents', () => {
    it('removes only synced events', () => {
      const event1 = createOfflineEvent(makeInput());
      createOfflineEvent(makeInput());

      updateEventSyncStatus(event1.localEventId, 'Synced');

      const removed = removeSyncedEvents();
      expect(removed).toBe(1);
      expect(getAllOfflineEvents()).toHaveLength(1);
    });
  });

  describe('clearAllOfflineEvents', () => {
    it('removes all events from storage', () => {
      createOfflineEvent(makeInput());
      createOfflineEvent(makeInput());

      clearAllOfflineEvents();
      expect(getAllOfflineEvents()).toEqual([]);
    });
  });

  describe('markEventsSynced', () => {
    it('removes synced events from storage', () => {
      const event1 = createOfflineEvent(makeInput());
      const event2 = createOfflineEvent(makeInput());
      createOfflineEvent(makeInput());

      const count = markEventsSynced([event1.localEventId, event2.localEventId]);
      expect(count).toBe(2);
      expect(getAllOfflineEvents()).toHaveLength(1);
    });
  });

  describe('markEventsFailed', () => {
    it('sets status to Failed and increments retry count', () => {
      const event1 = createOfflineEvent(makeInput());
      const event2 = createOfflineEvent(makeInput());

      markEventsFailed([event1.localEventId, event2.localEventId]);

      const events = getAllOfflineEvents();
      for (const e of events) {
        expect(e.syncStatus).toBe('Failed');
        expect(e.retryCount).toBe(1);
        expect(e.lastSyncAttemptAt).toBeTruthy();
      }
    });
  });

  describe('resetFailedEvents', () => {
    it('resets failed events to Pending', () => {
      const event1 = createOfflineEvent(makeInput());
      const event2 = createOfflineEvent(makeInput());

      markEventsFailed([event1.localEventId, event2.localEventId]);
      const resetCount = resetFailedEvents();

      expect(resetCount).toBe(2);
      const events = getAllOfflineEvents();
      for (const e of events) {
        expect(e.syncStatus).toBe('Pending');
      }
    });

    it('does not reset pending or synced events', () => {
      createOfflineEvent(makeInput());
      const event2 = createOfflineEvent(makeInput());
      updateEventSyncStatus(event2.localEventId, 'Failed');

      const resetCount = resetFailedEvents();
      expect(resetCount).toBe(1);
    });
  });
});
