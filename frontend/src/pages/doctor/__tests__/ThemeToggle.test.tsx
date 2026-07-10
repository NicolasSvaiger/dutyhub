import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { ThemeToggle } from '../ThemeToggle';
import { ThemeProvider } from '../../../contexts/ThemeContext';

/**
 * Envolve com o ThemeProvider real. Antes de cada teste limpamos localStorage
 * e o atributo `data-theme` do <html> pra sessão começar em light-mode limpa.
 */
function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('<ThemeToggle />', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('inicia em light mode e mostra label para ativar dark', () => {
    renderWithTheme();
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute(
      'aria-label',
      i18n.t('doctor.theme.toActivateDark'),
    );
  });

  it('alterna aria-label ao clicar (light -> dark -> light)', async () => {
    renderWithTheme();
    const user = userEvent.setup();
    const btn = screen.getByRole('button');

    // light -> click -> dark
    await user.click(btn);
    expect(btn).toHaveAttribute(
      'aria-label',
      i18n.t('doctor.theme.toActivateLight'),
    );

    // dark -> click -> light
    await user.click(btn);
    expect(btn).toHaveAttribute(
      'aria-label',
      i18n.t('doctor.theme.toActivateDark'),
    );
  });

  it('aplica data-theme no <html> após toggle', async () => {
    renderWithTheme();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(screen.getByRole('button'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persiste tema no localStorage após toggle', async () => {
    renderWithTheme();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(window.localStorage.getItem('plantonhub_theme')).toBe('dark');
  });
});
