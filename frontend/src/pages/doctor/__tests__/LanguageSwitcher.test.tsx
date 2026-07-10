import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { LanguageSwitcher } from '../LanguageSwitcher';

describe('<LanguageSwitcher />', () => {
  beforeEach(async () => {
    if (i18n.language !== 'pt') {
      await i18n.changeLanguage('pt');
    }
  });

  it('renderiza o botão colapsado por padrão', () => {
    render(<LanguageSwitcher />);
    const btn = screen.getByRole('button', {
      name: i18n.t('language.switcher'),
    });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('mostra o código do idioma atual em maiúscula', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('PT')).toBeInTheDocument();
  });

  it('abre a listbox ao clicar e expõe opções PT/EN/ES', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('language.switcher') }),
    );

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);

    // Ordem esperada (SUPPORTED_LANGUAGES em i18n/index.ts é pt,en,es)
    const codes = options.map((o) => o.textContent?.slice(0, 2));
    expect(codes).toEqual(['PT', 'EN', 'ES']);
  });

  it('marca a opção atual como aria-selected', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: i18n.t('language.switcher') }),
    );

    const options = screen.getAllByRole('option');
    const selected = options.filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toMatch(/^PT/);
  });

  it('selecionar outro idioma chama i18n.changeLanguage e fecha o popover', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('language.switcher') }),
    );

    const enOption = screen
      .getAllByRole('option')
      .find((o) => o.textContent?.startsWith('EN'))!;
    await user.click(enOption);

    // Popover fecha
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // Idioma efetivamente muda
    expect(i18n.language.startsWith('en')).toBe(true);
  });

  it('tecla Escape fecha o popover', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('language.switcher') }),
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
