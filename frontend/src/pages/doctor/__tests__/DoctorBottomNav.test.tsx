import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { DoctorBottomNav } from '../DoctorBottomNav';
import type { DoctorScreen } from '../types';

const screens: DoctorScreen[] = ['home', 'presenca', 'plantoes', 'reports', 'settings'];
const labels: Record<DoctorScreen, string> = {
  home: 'doctor.nav.home',
  presenca: 'doctor.nav.attendance',
  plantoes: 'doctor.nav.shifts',
  reports: 'doctor.nav.reports',
  settings: 'doctor.nav.settings',
};

function labelFor(screen: DoctorScreen): string {
  return i18n.t(labels[screen]);
}

describe('<DoctorBottomNav />', () => {
  it('renderiza cinco botões de navegação com os rótulos corretos', () => {
    render(<DoctorBottomNav activeScreen="home" onNavigate={vi.fn()} />);

    for (const s of screens) {
      expect(screen.getByRole('button', { name: new RegExp(labelFor(s), 'i') })).toBeInTheDocument();
    }
  });

  it('cada clique dispara onNavigate com a screen correspondente', async () => {
    const onNavigate = vi.fn();
    render(<DoctorBottomNav activeScreen="home" onNavigate={onNavigate} />);
    const user = userEvent.setup();

    for (const s of screens) {
      await user.click(screen.getByRole('button', { name: new RegExp(labelFor(s), 'i') }));
    }

    expect(onNavigate).toHaveBeenCalledTimes(screens.length);
    for (let i = 0; i < screens.length; i++) {
      expect(onNavigate).toHaveBeenNthCalledWith(i + 1, screens[i]);
    }
  });

  it.each(screens)(
    'aplica classe "active" apenas ao botão da screen ativa (%s)',
    (active) => {
      render(<DoctorBottomNav activeScreen={active} onNavigate={vi.fn()} />);

      for (const s of screens) {
        const btn = screen.getByRole('button', { name: new RegExp(labelFor(s), 'i') });
        const activeClass = btn.className.split(/\s+/).some((c) => /active/i.test(c));
        expect(activeClass).toBe(s === active);
      }
    },
  );

  it('todos os botões têm type="button"', () => {
    render(<DoctorBottomNav activeScreen="home" onNavigate={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(screens.length);
    for (const b of buttons) {
      expect(b).toHaveAttribute('type', 'button');
    }
  });
});
