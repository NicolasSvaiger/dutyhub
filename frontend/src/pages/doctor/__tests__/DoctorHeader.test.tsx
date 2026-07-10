import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { DoctorHeader } from '../DoctorHeader';
import { AuthContext, type AuthContextType, type AuthUser } from '../../../contexts/AuthContext';

// notificationsApi bate na rede no mount do NotificationBell (que fica dentro
// do header). Mock pra manter os testes rápidos e determinísticos.
vi.mock('../../../api/notificationsApi', () => ({
  notificationsApi: {
    getUnreadCount: () => Promise.resolve(0),
    getAll: () => Promise.resolve([]),
  },
}));

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
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

function renderWithAuth(user: AuthUser | null) {
  const value: AuthContextType = {
    user,
    token: user ? 'fake-token' : null,
    isAuthenticated: user !== null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };
  return render(
    <AuthContext value={value}>
      <DoctorHeader />
    </AuthContext>,
  );
}

describe('<DoctorHeader />', () => {
  it('mostra saudação com o nome do usuário quando ele tem nome', () => {
    renderWithAuth(makeUser({ name: 'Dra. Ana' }));
    const greeting = i18n.t('doctor.home.greeting', { name: 'Dra. Ana' });
    expect(screen.getByText(greeting)).toBeInTheDocument();
  });

  it('usa email como fallback quando não há nome', () => {
    renderWithAuth(makeUser({ name: null, email: 'medico@teste.com' }));
    const greeting = i18n.t('doctor.home.greeting', { name: 'medico@teste.com' });
    expect(screen.getByText(greeting)).toBeInTheDocument();
  });

  it('usa "doctor.role" como fallback quando não há nome nem email (user nulo)', () => {
    renderWithAuth(null);
    const greeting = i18n.t('doctor.home.greeting', {
      name: i18n.t('doctor.role'),
    });
    expect(screen.getByText(greeting)).toBeInTheDocument();
  });

  it('renderiza mensagem de boas-vindas', () => {
    renderWithAuth(makeUser());
    expect(screen.getByText(i18n.t('doctor.home.welcome'))).toBeInTheDocument();
  });

  it('renderiza label "Agora" e um valor de hora HH:MM', () => {
    renderWithAuth(makeUser());
    expect(screen.getByText(i18n.t('doctor.home.now'))).toBeInTheDocument();

    // O clock deve ter um HH:MM em algum lugar do header.
    const header = screen.getByText(i18n.t('doctor.home.now')).parentElement!;
    expect(header.textContent).toMatch(/\d{1,2}[:h]\d{2}/);
  });
});
