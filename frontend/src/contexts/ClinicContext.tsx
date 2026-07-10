import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../hooks/useAuth';
import type { Clinic } from '../types';

export interface ClinicContextType {
  clinics: Clinic[];
  activeClinic: Clinic | null;
  setActiveClinic: (clinic: Clinic) => void;
  loading: boolean;
  /** Resolve o nome de uma clínica pelo ID. Fallback pra 'Unidade' se não encontrada. */
  resolveClinicName: (clinicId: string) => string;
}

export const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

const ACTIVE_CLINIC_KEY = 'plantonhub_active_clinic';

interface ClinicProviderProps {
  children: ReactNode;
}

export function ClinicProvider({ children }: ClinicProviderProps) {
  const { isAuthenticated } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activeClinic, setActiveClinicState] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(false);

  const setActiveClinic = useCallback((clinic: Clinic) => {
    setActiveClinicState(clinic);
    localStorage.setItem(ACTIVE_CLINIC_KEY, clinic.id);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setClinics([]);
      setActiveClinicState(null);
      return;
    }

    const fetchClinics = async () => {
      setLoading(true);
      try {
        const response = await axiosInstance.get<Clinic[]>('/clinics');
        const fetchedClinics = response.data;
        setClinics(fetchedClinics);

        // Restore active clinic from localStorage or default to first
        const storedClinicId = localStorage.getItem(ACTIVE_CLINIC_KEY);
        const restored = fetchedClinics.find((c) => c.id === storedClinicId);

        if (restored) {
          setActiveClinicState(restored);
        } else if (fetchedClinics.length > 0) {
          setActiveClinicState(fetchedClinics[0]);
          localStorage.setItem(ACTIVE_CLINIC_KEY, fetchedClinics[0].id);
        }
      } catch {
        setClinics([]);
        setActiveClinicState(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchClinics();
  }, [isAuthenticated]);

  const resolveClinicName = useCallback(
    (clinicId: string): string => {
      const found = clinics.find((c) => c.id === clinicId);
      return found?.name ?? 'Unidade';
    },
    [clinics],
  );

  const value: ClinicContextType = {
    clinics,
    activeClinic,
    setActiveClinic,
    loading,
    resolveClinicName,
  };

  return <ClinicContext value={value}>{children}</ClinicContext>;
}
