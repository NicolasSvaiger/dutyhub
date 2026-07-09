import { useCallback, useEffect, useState } from 'react';
import retryQueue, { type FlushResult, type QueuedOperation } from '../utils/retryQueue';

/**
 * React hook that provides reactive access to the retry queue state.
 * Automatically re-renders when the queue changes.
 */
export function useRetryQueue() {
  const [pendingCount, setPendingCount] = useState(retryQueue.size());
  const [pendingOps, setPendingOps] = useState<QueuedOperation[]>(retryQueue.getAll());
  const [lastFlushResults, setLastFlushResults] = useState<FlushResult[] | null>(null);

  useEffect(() => {
    const unsubscribe = retryQueue.subscribe(() => {
      setPendingCount(retryQueue.size());
      setPendingOps(retryQueue.getAll());
    });
    return unsubscribe;
  }, []);

  const enqueue = useCallback(
    (operation: Pick<QueuedOperation, 'type' | 'payload'>) => {
      return retryQueue.enqueue(operation);
    },
    []
  );

  const manualFlush = useCallback(async () => {
    const sendFn = retryQueue.getSendFn();
    if (sendFn) {
      const results = await retryQueue.flush(sendFn);
      setLastFlushResults(results);
      return results;
    }
    return [];
  }, []);

  return {
    pendingCount,
    pendingOps,
    lastFlushResults,
    enqueue,
    manualFlush,
  };
}
