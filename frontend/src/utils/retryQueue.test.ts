/**
 * Property-based tests for RetryQueue using fast-check.
 *
 * **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.6, 9.7**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { enqueue, getAll, size, flush, _reset, type QueuedOperation, type SendFn } from './retryQueue';

// --- Arbitraries ---

const operationPayloadArb = fc.record({
  shiftId: fc.uuid(),
  latitude: fc.double({ min: -90, max: 90, noNaN: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true }),
  deviceId: fc.string({ minLength: 1, maxLength: 20 }),
  biometricValidated: fc.option(fc.boolean(), { nil: undefined }),
});

const operationTypeArb = fc.constantFrom('check-in' as const, 'check-out' as const);

const enqueueInputArb = fc.record({
  type: operationTypeArb,
  payload: operationPayloadArb,
});

// --- Tests ---

describe('RetryQueue Property-Based Tests', () => {
  beforeEach(() => {
    _reset();
  });

  /**
   * **Propriedade 9: Retry queue enfileira operações em falha de rede**
   *
   * For any array of operations that "fail with network error",
   * each one should be enqueued (queue size increases by 1 for each, up to max).
   *
   * **Validates: Requirements 9.1**
   */
  describe('Property 9: Retry queue enfileira operações em falha de rede', () => {
    it('enqueue increases size by 1 for each operation added (up to MAX_SIZE)', () => {
      fc.assert(
        fc.property(
          fc.array(enqueueInputArb, { minLength: 1, maxLength: 25 }),
          (operations) => {
            _reset();
            let expectedSize = 0;

            for (const op of operations) {
              const result = enqueue(op);
              if (expectedSize < 20) {
                expect(result.success).toBe(true);
                expect(result.id).toBeDefined();
                expectedSize++;
              } else {
                expect(result.success).toBe(false);
              }
              expect(size()).toBe(expectedSize);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('enqueued operations preserve original data', () => {
      fc.assert(
        fc.property(enqueueInputArb, (input) => {
          _reset();
          const result = enqueue(input);
          expect(result.success).toBe(true);

          const all = getAll();
          expect(all).toHaveLength(1);
          expect(all[0].type).toBe(input.type);
          expect(all[0].payload).toEqual(input.payload);
          expect(all[0].retryCount).toBe(0);
          expect(all[0].id).toBe(result.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Propriedade 10: Retry queue processa em ordem FIFO**
   *
   * For any N operations enqueued in order, getAll() returns them in
   * the same insertion order.
   *
   * **Validates: Requirements 9.3**
   */
  describe('Property 10: Retry queue processa em ordem FIFO', () => {
    it('getAll returns operations in insertion order', () => {
      fc.assert(
        fc.property(
          fc.array(enqueueInputArb, { minLength: 1, maxLength: 20 }),
          (operations) => {
            _reset();
            const ids: string[] = [];

            for (const op of operations) {
              const result = enqueue(op);
              if (result.success && result.id) {
                ids.push(result.id);
              }
            }

            const all = getAll();
            const allIds = all.map((op) => op.id);
            expect(allIds).toEqual(ids);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('flush processes operations in FIFO order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(enqueueInputArb, { minLength: 2, maxLength: 10 }),
          async (operations) => {
            _reset();
            const enqueuedIds: string[] = [];

            for (const op of operations) {
              const result = enqueue(op);
              if (result.success && result.id) {
                enqueuedIds.push(result.id);
              }
            }

            const processedOrder: string[] = [];
            const sendFn: SendFn = async (operation: QueuedOperation) => {
              processedOrder.push(operation.id);
              return { status: 200 };
            };

            await flush(sendFn);
            expect(processedOrder).toEqual(enqueuedIds);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Propriedade 11: Resolução de retry remove ou mantém conforme resultado**
   *
   * For any set of queued operations, when flush is called with a sendFn
   * that returns various results (success, 4xx error, network error),
   * operations with success/4xx are removed and network errors are retained.
   *
   * **Validates: Requirements 9.4, 9.5, 9.6**
   */
  describe('Property 11: Resolução de retry remove ou mantém conforme resultado', () => {
    it('success (2xx) removes operation from queue', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(enqueueInputArb, { minLength: 1, maxLength: 10 }),
          async (operations) => {
            _reset();
            for (const op of operations) {
              enqueue(op);
            }

            const sendFn: SendFn = async () => {
              return { status: 200 };
            };

            const results = await flush(sendFn);
            expect(results.every((r) => r.status === 'success')).toBe(true);
            expect(size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('business error (4xx) removes operation from queue', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(enqueueInputArb, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 400, max: 499 }),
          async (operations, statusCode) => {
            _reset();
            for (const op of operations) {
              enqueue(op);
            }

            const sendFn: SendFn = async () => {
              throw { status: statusCode, message: 'Business error' };
            };

            const results = await flush(sendFn);
            expect(results.every((r) => r.status === 'business_error')).toBe(true);
            expect(size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('network error keeps operation in queue', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(enqueueInputArb, { minLength: 1, maxLength: 10 }),
          async (operations) => {
            _reset();
            for (const op of operations) {
              enqueue(op);
            }
            const enqueuedCount = size();

            const sendFn: SendFn = async () => {
              throw new Error('Network error');
            };

            const results = await flush(sendFn);
            expect(results.every((r) => r.status === 'network_error')).toBe(true);
            expect(size()).toBe(enqueuedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('mixed results: success/4xx removed, network errors retained', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(enqueueInputArb, { minLength: 3, maxLength: 10 }),
          fc.array(
            fc.constantFrom('success' as const, 'business_error' as const, 'network_error' as const),
            { minLength: 10, maxLength: 10 }
          ),
          async (operations, outcomes) => {
            _reset();
            for (const op of operations) {
              enqueue(op);
            }

            let callIndex = 0;
            const sendFn: SendFn = async () => {
              const outcome = outcomes[callIndex % outcomes.length];
              callIndex++;
              if (outcome === 'success') {
                return { status: 200 };
              } else if (outcome === 'business_error') {
                throw { status: 409, message: 'Conflict' };
              } else {
                throw new Error('Network error');
              }
            };

            const results = await flush(sendFn);

            const networkErrorCount = results.filter((r) => r.status === 'network_error').length;
            expect(size()).toBe(networkErrorCount);

            // All remaining items should be the ones that had network errors
            const remaining = getAll();
            expect(remaining).toHaveLength(networkErrorCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Propriedade 12: Retry queue respeita limite de capacidade**
   *
   * For any N > 20 attempts to enqueue, only the first 20 succeed
   * and the queue size stays at 20.
   *
   * **Validates: Requirements 9.7**
   */
  describe('Property 12: Retry queue respeita limite de capacidade', () => {
    it('rejects enqueue when queue is at max capacity (20)', () => {
      fc.assert(
        fc.property(
          fc.array(enqueueInputArb, { minLength: 21, maxLength: 30 }),
          (operations) => {
            _reset();

            let successCount = 0;
            let failCount = 0;

            for (const op of operations) {
              const result = enqueue(op);
              if (result.success) {
                successCount++;
              } else {
                failCount++;
                expect(result.reason).toBeDefined();
              }
            }

            expect(successCount).toBe(20);
            expect(failCount).toBe(operations.length - 20);
            expect(size()).toBe(20);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('queue size never exceeds 20 regardless of number of enqueue attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (numAttempts) => {
            _reset();

            for (let i = 0; i < numAttempts; i++) {
              enqueue({
                type: i % 2 === 0 ? 'check-in' : 'check-out',
                payload: {
                  shiftId: `shift-${i}`,
                  latitude: -23.5,
                  longitude: -46.6,
                  deviceId: `device-${i}`,
                },
              });
            }

            expect(size()).toBeLessThanOrEqual(20);
            expect(size()).toBe(Math.min(numAttempts, 20));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
