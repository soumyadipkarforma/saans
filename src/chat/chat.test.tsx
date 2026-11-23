import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantTurn, Profile } from '../types';
import { ChatInput } from './ChatInput';
import { Chips } from './Chips';
import { MessageList } from './MessageList';
import { useConversation, type Assistant } from './useConversation';

afterEach(() => localStorage.clear());

const profile: Profile = { household: [], activities: [] };
const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  reply: 'Hello back',
  chips: [],
  profile,
  air: null,
  forecast: null,
  plan: null,
  candidates: [],
  degraded: true,
  guarded: false,
  ...over,
});

describe('ChatInput', () => {
  it('sends on Enter, clears, and keeps focus in the input', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const input = screen.getByLabelText('Your message');
    await user.type(input, 'Delhi{Enter}');
    expect(onSend).toHaveBeenCalledWith('Delhi');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('disables Send while empty and while busy', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatInput onSend={vi.fn()} />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Your message'), 'hi');
    expect(send).toBeEnabled();
    rerender(<ChatInput onSend={vi.fn()} busy />);
    expect(send).toBeDisabled();
  });

  it('blocks the 501st character and shows a counter', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} />);
    const input = screen.getByLabelText('Your message');
    await user.click(input);
    await user.paste('a'.repeat(501));
    expect(input).toHaveValue('a'.repeat(500));
    expect(screen.getByText('500 of 500 characters')).toBeInTheDocument();
  });
});

describe('Chips and MessageList', () => {
  it('chips are buttons that report their label', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Chips items={['Car', 'Aurangabad, Maharashtra']} onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: 'Aurangabad, Maharashtra' }));
    expect(onPick).toHaveBeenCalledWith('Aurangabad, Maharashtra');
  });

  it('renders messages as plain text inside a polite log', () => {
    render(<MessageList messages={[{ role: 'model', text: '<b>hi</b>' }]} thinking={false} />);
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveTextContent('<b>hi</b>');
    expect(log.querySelector('b')).toBeNull();
  });
});

describe('useConversation', () => {
  it('adds the assistant reply, merges the turn and persists the profile', async () => {
    const next: Profile = {
      household: [{ group: 'adult', respiratory: false, pregnant: false }],
      activities: [],
    };
    const assistant = vi.fn<Assistant>().mockResolvedValue(turn({ profile: next }));
    const { result } = renderHook(() => useConversation(assistant));
    await act(() => result.current.send('Delhi'));
    expect(result.current.messages.map((m) => m.text)).toEqual(['Delhi', 'Hello back']);
    expect(result.current.profile).toEqual(next);
    expect(JSON.parse(localStorage.getItem('saans.profile') ?? '')).toEqual(next);
    expect(result.current.status).toBe('idle');
  });

  it('keeps only the last 12 messages', async () => {
    const assistant = vi.fn<Assistant>().mockResolvedValue(turn());
    const { result } = renderHook(() => useConversation(assistant));
    for (let i = 0; i < 8; i++) await act(() => result.current.send(`m${i}`));
    expect(result.current.messages).toHaveLength(12);
    expect(assistant.mock.calls.at(-1)?.[0].messages.length).toBeLessThanOrEqual(12);
  });

  it('shows a friendly error when the assistant throws and stays usable', async () => {
    const assistant = vi
      .fn<Assistant>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(turn());
    const { result } = renderHook(() => useConversation(assistant));
    await act(() => result.current.send('hi'));
    expect(result.current.messages.at(-1)?.text).toMatch(/something went wrong/);
    expect(result.current.status).toBe('idle');
    await act(() => result.current.send('again'));
    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe('Hello back'));
  });

  it('ignores a corrupted or invalid stored profile', () => {
    localStorage.setItem('saans.profile', '{not json');
    expect(renderHook(() => useConversation(vi.fn())).result.current.profile).toEqual(profile);
    localStorage.setItem('saans.profile', JSON.stringify({ household: 5 }));
    expect(renderHook(() => useConversation(vi.fn())).result.current.profile).toEqual(profile);
  });

  it('loads a valid stored profile and reset clears it', () => {
    const stored: Profile = {
      location: { city: 'Delhi', lat: 28.6, lon: 77.2 },
      household: [],
      activities: [],
    };
    localStorage.setItem('saans.profile', JSON.stringify(stored));
    const { result } = renderHook(() => useConversation(vi.fn()));
    expect(result.current.profile).toEqual(stored);
    act(() => result.current.reset());
    expect(result.current.profile).toEqual(profile);
    expect(localStorage.getItem('saans.profile')).toBeNull();
  });

  it('keeps the last turn that had air while a later turn has none', async () => {
    const good = turn({ air: { aqi: 1 } as AssistantTurn['air'] });
    const assistant = vi.fn<Assistant>().mockResolvedValueOnce(good).mockResolvedValue(turn());
    const { result } = renderHook(() => useConversation(assistant));
    await act(() => result.current.send('Delhi'));
    await act(() => result.current.send('thanks'));
    expect(result.current.turn?.air).toBeNull();
    expect(result.current.lastGood).toBe(good);
  });
});
