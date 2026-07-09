import { useContext } from 'react';
import { ClinicContext, type ClinicContextType } from '../contexts/ClinicContext';

export function useClinic(): ClinicContextType {
  const context = useContext(ClinicContext);
  if (context === undefined) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
}
