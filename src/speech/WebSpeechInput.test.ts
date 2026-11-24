import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSpeechInput } from './WebSpeechInput';

interface Fake {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult?: (e: unknown) => void;
  onerror?: (e: unknown) => void;
  onend?: () => void;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}
const made: Fake[] = [];
let last: Fake | undefined;
const w = window as unknown as Record<string, unknown>;

class FakeRecognition {
  lang = '';
  interimResults = false;
  continuous = true;
  onresult: Fake['onresult'];
  onerror: Fake['onerror'];
  onend: Fake['onend'];
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    made.push(this);
    last = made.at(-1);
  }
}
const result = (text: string, isFinal: boolean) => ({
  results: [{ isFinal, 0: { transcript: text } }],
});

afterEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});

describe('WebSpeechInput', () => {
  it('is unsupported when the API is absent', () => {
    expect(new WebSpeechInput().isSupported()).toBe(false);
  });

  it('configures en-IN / hi-IN, interim results, not continuous', () => {
    w.webkitSpeechRecognition = FakeRecognition;
    const input = new WebSpeechInput();
    expect(input.isSupported()).toBe(true);
    input.start('hi');
    expect(last).toMatchObject({ lang: 'hi-IN', interimResults: true, continuous: false });
    input.start('en');
    expect(last?.lang).toBe('en-IN');
  });

  it('maps interim to partial and final to final', () => {
    w.SpeechRecognition = FakeRecognition;
    const input = new WebSpeechInput();
    const partial = vi.fn();
    const final = vi.fn();
    input.on('partial', partial);
    const off = input.on('final', final);
    input.start('en');
    last?.onresult?.(result('I live in', false));
    last?.onresult?.(result('I live in Pune', true));
    expect(partial).toHaveBeenCalledWith('I live in');
    expect(final).toHaveBeenCalledWith('I live in Pune');
    off();
    last?.onresult?.(result('again', true));
    expect(final).toHaveBeenCalledTimes(1);
  });

  it('maps errors and emits end', () => {
    w.SpeechRecognition = FakeRecognition;
    const input = new WebSpeechInput();
    const err = vi.fn<(c: string) => void>();
    const end = vi.fn();
    input.on('error', err);
    input.on('end', end);
    input.start('en');
    for (const e of ['not-allowed', 'service-not-allowed', 'no-speech', 'network', 'weird'])
      last?.onerror?.({ error: e });
    expect(err.mock.calls.map((c) => c[0])).toEqual([
      'not-allowed',
      'not-allowed',
      'no-speech',
      'network',
      'other',
    ]);
    last?.onend?.();
    expect(end).toHaveBeenCalled();
  });

  it('reports other when start throws, and stop is forwarded', () => {
    class Throwing extends FakeRecognition {
      start = vi.fn((): void => {
        throw new Error('busy');
      });
    }
    w.SpeechRecognition = Throwing;
    const input = new WebSpeechInput();
    const err = vi.fn<(c: string) => void>();
    input.on('error', err);
    input.start('en');
    expect(err).toHaveBeenCalledWith('other');
    input.stop();
    expect(last?.stop).toHaveBeenCalled();
  });
});
