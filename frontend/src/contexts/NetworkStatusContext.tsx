import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface NetworkStatusContextType {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Timestamp of the last connectivity change */
  lastChangedAt: number | null;
}

export const NetworkStatusContext = createContext<NetworkStatusContextType | undefined>(undefined);

interface NetworkStatusProviderProps {
  children: ReactNode;
}

/**
 * Provider that tracks online/offline status using navigator.onLine
 * and window online/offline events.
 *
 * Exposes a reactive `isOnline` state that components can subscribe to.
 */
export function NetworkStatusProvider({ children }: NetworkStatusProviderProps) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastChangedAt, setLastChangedAt] = useState<number | null>(null);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setLastChangedAt(Date.now());
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setLastChangedAt(Date.now());
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  const value: NetworkStatusContextType = {
    isOnline,
    lastChangedAt,
  };

  return (
    <NetworkStatusContext value={value}>{children}</NetworkStatusContext>
  );
}
