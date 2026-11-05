import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriptionForm } from '../apps/web/src/SubscriptionForm';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('submits an email and confirms the subscription', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetcher);
  render(<SubscriptionForm />);
  await userEvent.type(screen.getByLabelText('Seu e-mail'), 'reader@example.com');
  await userEvent.click(screen.getByRole('button', { name: /Quero receber novidades/ }));
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringMatching(/\/subscribers$/),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'reader@example.com' }),
    }),
  );
  expect((await screen.findByRole('status')).textContent).toContain('inscrição');
});

it('shows an error when the API is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<SubscriptionForm />);
  await userEvent.type(screen.getByLabelText('Seu e-mail'), 'reader@example.com');
  await userEvent.click(screen.getByRole('button', { name: /Quero receber novidades/ }));
  expect(await screen.findByRole('alert')).toBeTruthy();
});
