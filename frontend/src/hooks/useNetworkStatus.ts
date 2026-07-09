import { useContext } from 'react';
import { NetworkStatusContext, type NetworkStatusContextType } from '../contexts/NetworkStatusContext';

/**
 * Hook to access the global network status (online/offline).
 * Must be used within a NetworkStatusProvider.
 */
export function useNetworkStatus(): NetworkStatusContextType {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within a NetworkStatusProvider');
  }
  return context;
}
