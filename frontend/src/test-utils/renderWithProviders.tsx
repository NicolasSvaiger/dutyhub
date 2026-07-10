import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext, type AuthContextType, type AuthUser } from '../contexts/AuthContext';
import { ClinicContext, type ClinicContextType } from '../contexts/ClinicContext';
import { NetworkStatusContext, type NetworkStatusContextType } from '../contexts/NetworkStatusContext';
import type { Clinic } from '../types';

export interface TestUserOverrides extends Partial<AuthUser> {}

/** Default test user — médico com uma clínica. Override o que precisar. */
export function makeTestUser(overrides: TestUserOverrides = {}): AuthUser {
  return {
    userId: 'u-1',
    email: 'medico@teste.com',
    name: 'Dra. Ana',
    roles: ['Doctor'],
    clinicId: 'c-1',
    clinicIds: ['c-1'],
    ...overrides,
  };
}

/** Default test clinic. */
export function makeTestClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'c-1',
    name: 'Clínica Alpha',
    address: 'Rua X, 100',
    phone: '11999999999',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

interface ProvidersProps {
  children: ReactNode;
  user?: AuthUser | null;
  clinics?: Clinic[];
  activeClinic?: Clinic | null;
  isOnline?: boolean;
  onSetActiveClinic?: (clinic: Clinic) => void;
}

/** Wrapper que injeta valores diretos nos contexts, sem chamar as providers reais
 *  (que fazem requisições no mount). Ótimo pra testes de tela isolados. */
export function TestProviders({
  children,
  user = makeTestUser(),
  clinics = [makeTestClinic()],
  activeClinic,
  isOnline = true,
  onSetActiveClinic,
}: ProvidersProps) {
  const authValue: AuthContextType = {
    user,
    token: user ? 'fake-token' : null,
    isAuthenticated: user !== null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  const clinicValue: ClinicContextType = {
    clinics,
    activeClinic: activeClinic === undefined ? (clinics[0] ?? null) : activeClinic,
    setActiveClinic: onSetActiveClinic ?? vi.fn(),
    loading: false,
    resolveClinicName: (clinicId: string) => {
      const found = clinics.find((c) => c.id === clinicId);
      return found?.name ?? 'Unidade';
    },
  };

  const networkValue: NetworkStatusContextType = {
    isOnline,
    lastChangedAt: null,
  };

  return (
    <AuthContext value={authValue}>
      <NetworkStatusContext value={networkValue}>
        <ClinicContext value={clinicValue}>{children}</ClinicContext>
      </NetworkStatusContext>
    </AuthContext>
  );
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'>, Omit<ProvidersProps, 'children'> {}

/** Render + envolve com os providers de teste. */
export function renderWithProviders(
  ui: ReactElement,
  { user, clinics, activeClinic, isOnline, onSetActiveClinic, ...renderOptions }: RenderWithProvidersOptions = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders
        user={user}
        clinics={clinics}
        activeClinic={activeClinic}
        isOnline={isOnline}
        onSetActiveClinic={onSetActiveClinic}
      >
        {children}
      </TestProviders>
    ),
    ...renderOptions,
  });
}
