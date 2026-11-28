import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { Assistant } from '../chat/useConversation';
import { t, useLang } from '../i18n/i18n';
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
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
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

// The utterance Saans is currently speaking; its onend hands the turn back to the mic.
const lastUtterance = () => synth.speak.mock.calls.at(-1)?.[0] as FakeUtterance;
const finishSpeaking = () => act(() => lastUtterance().onend?.());

// Starts live mode from an empty chat: Saans greets, and the mic opens once the greeting ends.
async function startLive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: t('live.start', {}, 'en') }));
  finishSpeaking();
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
    expect(screen.queryByRole('button', { name: /Start live conversation/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Voice input is not available/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toBeInTheDocument();
  });

  it('greets first when a live conversation starts, then listens in en-IN once the greeting ends', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Talk instead (hands-free)' }));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(lastUtterance().text).toBe(t('reply.greet', {}, 'en'));
    expect(FakeRecognition.last).toBeNull();

    finishSpeaking();
    expect(FakeRecognition.last?.lang).toBe('en-IN');
    expect(FakeRecognition.last?.start).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: `${t('mic.label', {}, 'en')}: ${t('live.listening', {}, 'en')}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(t('live.listening', {}, 'en'));
  });

  it('tapping the orb stops listening, and tapping it again starts listening', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await startLive(user);
    const orb = screen.getByRole('button', { name: /Speak your message: Listening/ });
    await user.click(orb);
    expect(FakeRecognition.last?.stop).toHaveBeenCalled();
    act(() => FakeRecognition.last?.onend?.());
    const stopped = FakeRecognition.last;
    await user.click(screen.getByRole('button', { name: /Speak your message/ }));
    // Each start makes a new recognition object.
    expect(FakeRecognition.last).not.toBe(stopped);
    expect(FakeRecognition.last?.start).toHaveBeenCalled();
  });

  it('End live returns to the start button and stops listening', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await startLive(user);
    await user.click(screen.getByRole('button', { name: 'End live' }));
    expect(FakeRecognition.last?.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Talk instead (hands-free)' })).toBeInTheDocument();
  });

  it('starts recognition in hi-IN when the page is in Hindi', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'हिंदी' }));
    await user.click(screen.getByRole('button', { name: t('live.start', {}, 'hi') }));
    finishSpeaking();
    expect(lastUtterance().lang).toBe('hi-IN');
    expect(FakeRecognition.last?.lang).toBe('hi-IN');
  });

  it('shows partial text in a polite live caption, then sends the final text', async () => {
    installSpeech();
    const user = userEvent.setup();
    const assistant = vi.fn<Assistant>().mockResolvedValue(reply('Which city?'));
    render(<App assistant={assistant} />);
    await startLive(user);
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
    await startLive(user);
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

  it('sending text cancels the spoken greeting', async () => {
    installSpeech();
    const user = userEvent.setup();
    render(<App assistant={vi.fn<Assistant>().mockResolvedValue(reply('Hi.'))} />);
    await startLive(user);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    synth.cancel.mockClear();
    await user.type(screen.getByLabelText('Your message'), 'hello{Enter}');
    expect(synth.cancel).toHaveBeenCalled();
  });
});
