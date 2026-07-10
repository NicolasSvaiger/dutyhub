import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { LogoutModal } from '../LogoutModal';

describe('<LogoutModal />', () => {
  it('renderiza título, mensagem e dois botões', () => {
    render(<LogoutModal onConfirm={vi.fn()} onCancel={vi.fn()} />);

    // Título e mensagem vêm das chaves i18n (pt-BR)
    expect(
      screen.getByText(i18n.t('doctor.logout.title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('doctor.logout.message')),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: i18n.t('doctor.logout.cancel') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('doctor.logout.confirm') }),
    ).toBeInTheDocument();
  });

  it('chama onConfirm ao clicar em confirmar', async () => {
    const onConfirm = vi.fn();
    render(<LogoutModal onConfirm={onConfirm} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('doctor.logout.confirm') }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('chama onCancel ao clicar em cancelar', async () => {
    const onCancel = vi.fn();
    render(<LogoutModal onConfirm={vi.fn()} onCancel={onCancel} />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('doctor.logout.cancel') }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cada handler é chamado só quando seu próprio botão é clicado', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<LogoutModal onConfirm={onConfirm} onCancel={onCancel} />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('doctor.logout.cancel') }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: i18n.t('doctor.logout.confirm') }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ambos os botões têm type="button" (não submetem forms)', () => {
    render(<LogoutModal onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });
});
