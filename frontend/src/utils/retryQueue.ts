/**
 * RetryQueue - TypeScript module for offline operation queueing.
 * Stores failed check-in/check-out operations and retries them
 * when connectivity is restored.
 *
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

export interface QueuedOperation {
  id: string;
  type: 'check-in' | 'check-out';
  payload: {
    shiftId: string;
    latitude: number;
    longitude: number;
    deviceId: string;
    biometricValidated?: boolean;
  };
  timestamp: number;
  retryCount: number;
}

export interface EnqueueResult {
  success: boolean;
  id?: string;
  reason?: string;
}

export interface FlushResult {
  id: string;
  status: 'success' | 'business_error' | 'network_error';
  response?: unknown;
  error?: { status?: number; message?: string };
}

export type SendFn = (operation: QueuedOperation) => Promise<unknown>;

const MAX_SIZE = 20;
let queue: QueuedOperation[] = [];
let sendFn: SendFn | null = null;
const listeners: Array<() => void> = [];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Subscribe to queue changes. Returns unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/**
 * Adds an operation to the retry queue.
 * Rejects if queue is at max capacity (20 operations).
 */
export function enqueue(operation: Pick<QueuedOperation, 'type' | 'payload'>): EnqueueResult {
  if (queue.length >= MAX_SIZE) {
    return { success: false, reason: 'Fila cheia (máximo 20 operações)' };
  }

  const entry: QueuedOperation = {
    id: generateId(),
    type: operation.type,
    payload: operation.payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  queue.push(entry);
  notifyListeners();
  return { success: true, id: entry.id };
}

/**
 * Removes an operation from the queue by its ID.
 */
export function dequeue(operationId: string): boolean {
  const index = queue.findIndex((op) => op.id === operationId);
  if (index !== -1) {
    queue.splice(index, 1);
    notifyListeners();
    return true;
  }
  return false;
}

/**
 * Returns a copy of all pending operations in FIFO order.
 */
export function getAll(): QueuedOperation[] {
  return [...queue];
}

/**
 * Returns the number of pending operations.
 */
export function size(): number {
  return queue.length;
}

/**
 * Attempts to resend all pending operations in FIFO order.
 * - Success (2xx): removes from queue
 * - Business error (4xx): removes from queue, reports error
 * - Network error or 5xx: keeps in queue for next retry
 */
export async function flush(send: SendFn): Promise<FlushResult[]> {
  const results: FlushResult[] = [];
  const toRetain: QueuedOperation[] = [];

  for (const operation of queue) {
    try {
      const response = await send(operation);
      results.push({ id: operation.id, status: 'success', response });
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err && err.status && err.status >= 400 && err.status < 500) {
        results.push({ id: operation.id, status: 'business_error', error: err });
      } else {
        operation.retryCount += 1;
        toRetain.push(operation);
        results.push({ id: operation.id, status: 'network_error', error: err });
      }
    }
  }

  queue = toRetain;
  notifyListeners();
  return results;
}

/**
 * Sets the send function used by the online event handler for auto-flush.
 */
export function setSendFn(fn: SendFn): void {
  sendFn = fn;
}

/**
 * Returns the currently registered send function.
 */
export function getSendFn(): SendFn | null {
  return sendFn;
}

/**
 * Resets the queue (for testing purposes).
 */
export function _reset(): void {
  queue = [];
  notifyListeners();
}

// Auto-flush when connectivity is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (sendFn) {
      flush(sendFn);
    }
  });
}

const retryQueue = {
  MAX_SIZE,
  enqueue,
  dequeue,
  getAll,
  size,
  flush,
  setSendFn,
  getSendFn,
  subscribe,
  _reset,
};

export default retryQueue;
