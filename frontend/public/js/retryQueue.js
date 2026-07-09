/**
 * RetryQueue - Module for offline operation queueing
 * Stores failed check-in/check-out operations and retries them
 * when connectivity is restored.
 *
 * IIFE pattern to avoid polluting global scope.
 * Compatible with both browser and Node.js (for testing).
 *
 * @see Requirements 9.1, 9.3, 9.7
 */
const RetryQueue = (() => {
  const MAX_SIZE = 20;
  let queue = [];

  /**
   * Generates a unique ID for each queued operation.
   * @returns {string}
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Adds an operation to the retry queue.
   * Rejects if queue is at max capacity (20 operations).
   *
   * @param {{ type: string, payload: object }} operation
   * @returns {{ success: boolean, id?: string, reason?: string }}
   */
  function enqueue(operation) {
    if (queue.length >= MAX_SIZE) {
      return { success: false, reason: 'Queue is full (max 20 operations)' };
    }

    const entry = {
      id: generateId(),
      type: operation.type,
      payload: operation.payload,
      timestamp: Date.now(),
      retryCount: 0,
    };

    queue.push(entry);
    return { success: true, id: entry.id };
  }

  /**
   * Removes an operation from the queue by its ID.
   *
   * @param {string} operationId
   * @returns {boolean} true if the operation was found and removed
   */
  function dequeue(operationId) {
    const index = queue.findIndex((op) => op.id === operationId);
    if (index !== -1) {
      queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Returns a copy of all pending operations in FIFO order.
   *
   * @returns {Array} copy of the queue
   */
  function getAll() {
    return [...queue];
  }

  /**
   * Returns the number of pending operations.
   *
   * @returns {number}
   */
  function size() {
    return queue.length;
  }

  /**
   * Attempts to resend all pending operations in FIFO order.
   * - Success (2xx): removes from queue
   * - Business error (4xx): removes from queue, reports error
   * - Network error: keeps in queue for next retry, increments retryCount
   *
   * @param {function} sendFn - async function that sends an operation to the server.
   *   Should resolve on success (2xx) and reject with an error object.
   *   Error object should have a `status` property for HTTP status codes.
   * @returns {Promise<Array<{ id: string, status: string, response?: any, error?: any }>>}
   */
  async function flush(sendFn) {
    const results = [];
    const toRetain = [];

    for (const operation of queue) {
      try {
        const response = await sendFn(operation);
        // Success (2xx) - remove from queue
        results.push({ id: operation.id, status: 'success', response });
      } catch (error) {
        if (error && error.status >= 400 && error.status < 500) {
          // Business error (4xx) - remove from queue, notify user
          results.push({ id: operation.id, status: 'business_error', error });
        } else {
          // Network error or 5xx - keep in queue for next retry
          operation.retryCount += 1;
          toRetain.push(operation);
          results.push({ id: operation.id, status: 'network_error', error });
        }
      }
    }

    queue = toRetain;
    return results;
  }

  /**
   * Resets the queue (for testing purposes only).
   */
  function _reset() {
    queue = [];
  }

  return {
    MAX_SIZE,
    enqueue,
    dequeue,
    getAll,
    size,
    flush,
    _reset,
  };
})();

// Auto-flush when connectivity is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (RetryQueue._sendFn) {
      RetryQueue.flush(RetryQueue._sendFn);
    }
  });
}

// Export for Node.js (testing) environments - supports both CommonJS and ESM
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RetryQueue;
}

// Also expose as default export for ESM imports
if (typeof globalThis !== 'undefined') {
  globalThis.RetryQueue = RetryQueue;
}
