import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyDialog } from './KeyDialog';
import { keyStore } from './keyStore';

const KEY = 'AIza-0123456789-abcdefghij';

// jsdom has no modal dialog support, so stub the two methods the component uses.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});
afterEach(() => {
  sessionStorage.clear();
});

function setup(open = true) {
  const onClose = vi.fn();
  const onChange = vi.fn();
  render(<KeyDialog open={open} onClose={onClose} onChange={onChange} />);
  return { onClose, onChange };
}

describe('KeyDialog', () => {
  it('opens as a modal with a labelled password field, the key link and the privacy note', () => {
    setup();
    expect(showModal).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Gemini key (optional)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your Gemini API key')).toHaveAttribute('type', 'password');
    const link = screen.getByRole('link', { name: /Google AI Studio/ });
    expect(link).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/stays in this browser tab/)).toBeInTheDocument();
  });

  it('saves a valid key and closes', async () => {
    const { onClose, onChange } = setup();
    await userEvent.type(screen.getByLabelText('Your Gemini API key'), KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(keyStore.get()).toBe(KEY);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects a short key with an alert and stays open', async () => {
    const { onClose } = setup();
    await userEvent.type(screen.getByLabelText('Your Gemini API key'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/too short/);
    expect(keyStore.get()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the key', async () => {
    keyStore.set(KEY);
    const { onChange, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(keyStore.get()).toBeNull();
    expect(onChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('continues without AI and closes on Escape', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Continue without AI' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText('Your Gemini API key'), '{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
