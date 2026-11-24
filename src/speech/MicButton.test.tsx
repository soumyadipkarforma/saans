import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { Assistant } from '../chat/useConversation';
import { useLang } from '../i18n/i18n';
import type { AssistantTurn } from '../types';

const w = window as unknown as Record<string, unknown>;

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    FakeRecognition.last = this;
  }
  say(text: string, isFinal: boolean) {
    act(() => this.onresult?.({ results: [{ isFinal, 0: { transcript: text } }] }));
  }
}

const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => []) };
class FakeUtterance {
  voice: unknown = null;
  lang = '';
  constructor(public text: string) {}
}

const reply = (text: string): AssistantTurn => ({
  reply: text,
  chips: ['Car chip'],
  profile: { household: [], activities: [] },
  air: null,
  forecast: null,
  plan: null,
  candidates: [],
  degraded: true,
  guarded: false,
});

function installSpeech() {
  w.SpeechRecognition = FakeRecognition;
  w.speechSynthesis = synth;
  w.SpeechSynthesisUtterance = FakeUtterance;
}

beforeEach(() => {
  FakeRecognition.last = null;
});

afterEach(() => {
  vi.clearAllMocks();
  delete w.SpeechRecognition;
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
  localStorage.clear();
  const { result } = renderHook(() => useLang());
  act(() => result.current.setLang('en'));
});

describe('mic UI', () => {
  it('shows a note and keeps typing when speech recognition is unsupported', () => {
    render(<App assistant={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Speak your message' })).not.toBeInTheDocument();
    expect(screen.getByText(/Voice input is not available/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toBeInTheDocument();
  });

  it('toggles aria-pressed and starts recognition in en-IN', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    const mic = screen.getByRole('button', { name: 'Speak your message' });
    expect(mic).toHaveAttribute('aria-pressed', 'false');
    await user.click(mic);
    expect(mic).toHaveAttribute('aria-pressed', 'true');
    expect(FakeRecognition.last?.lang).toBe('en-IN');
    expect(FakeRecognition.last?.start).toHaveBeenCalled();
    await user.click(mic);
    expect(FakeRecognition.last?.stop).toHaveBeenCalled();
    act(() => FakeRecognition.last?.onend?.());
    expect(mic).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts recognition in hi-IN when the page is in Hindi', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'हिंदी' }));
    await user.click(screen.getByRole('button', { name: 'अपना संदेश बोलें' }));
    expect(FakeRecognition.last?.lang).toBe('hi-IN');
  });

  it('shows partial text in a polite live caption, then sends the final text', async () => {
    installSpeech();
    const user = userEvent.setup();
    const assistant = vi.fn<Assistant>().mockResolvedValue(reply('Which city?'));
    render(<App assistant={assistant} />);
    await user.click(screen.getByRole('button', { name: 'Speak your message' }));
    FakeRecognition.last?.say('I live in', false);
    const caption = screen.getByText('I live in');
    expect(caption).toHaveAttribute('aria-live', 'polite');
    FakeRecognition.last?.say('I live in Pune', true);
    await waitFor(() => expect(assistant).toHaveBeenCalled());
    expect(assistant.mock.calls[0]?.[0].messages.at(-1)?.text).toBe('I live in Pune');
    expect(screen.queryByText('I live in')).not.toBeInTheDocument();
  });

  it('shows a friendly message and focuses the text box when the microphone is denied', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Speak your message' }));
    act(() => FakeRecognition.last?.onerror?.({ error: 'not-allowed' }));
    expect(await screen.findByText(/Microphone access was blocked/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toHaveFocus();
  });

  it('speaks each assistant reply, never chip labels; mute stops and silences it', async () => {
    installSpeech();
    const user = userEvent.setup();
    const assistant = vi.fn<Assistant>().mockResolvedValue(reply('First reply. Second.'));
    render(<App assistant={assistant} />);
    await user.type(screen.getByLabelText('Your message'), 'hello{Enter}');
    await within(screen.getByRole('log')).findByText(/First reply/);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect((synth.speak.mock.calls[0]?.[0] as FakeUtterance).text).toBe('First reply. Second.');

    const mute = screen.getByRole('button', { name: 'Mute spoken replies' });
    await user.click(mute);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('saans.muted')).toBe('1');
    expect(synth.cancel).toHaveBeenCalled();

    await user.type(screen.getByLabelText('Your message'), 'again{Enter}');
    await waitFor(() => expect(assistant).toHaveBeenCalledTimes(2));
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('cancels speech when sending text or starting the mic', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn<Assistant>().mockResolvedValue(reply('Hi.'))} />);
    synth.cancel.mockClear();
    await user.type(screen.getByLabelText('Your message'), 'hello{Enter}');
    expect(synth.cancel).toHaveBeenCalled();
    synth.cancel.mockClear();
    await user.click(screen.getByRole('button', { name: 'Speak your message' }));
    expect(synth.cancel).toHaveBeenCalled();
  });
});
