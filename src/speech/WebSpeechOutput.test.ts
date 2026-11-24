import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstSentences, WebSpeechOutput } from './WebSpeechOutput';

const w = window as unknown as Record<string, unknown>;
const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => [] as unknown[]) };

class FakeUtterance {
  voice: unknown = null;
  lang = '';
  constructor(public text: string) {}
}

function install() {
  w.speechSynthesis = synth;
  w.SpeechSynthesisUtterance = FakeUtterance;
}

afterEach(() => {
  vi.clearAllMocks();
  synth.getVoices.mockReturnValue([]);
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
});

describe('WebSpeechOutput', () => {
  it('is unsupported when absent and silently ignores calls', () => {
    const out = new WebSpeechOutput();
    expect(out.isSupported()).toBe(false);
    out.speak('hi', 'en');
    out.cancel();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speaks only the first three sentences, cancelling first', () => {
    install();
    new WebSpeechOutput().speak('One. Two! Three? Four.', 'en');
    expect(synth.cancel).toHaveBeenCalledBefore(synth.speak);
    const u = synth.speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(u.text).toBe('One. Two! Three?');
    expect(u.lang).toBe('en-IN');
  });

  it('picks a Hindi voice when there is one, an en-IN voice for English', () => {
    install();
    const hi = { lang: 'hi-IN' };
    const en = { lang: 'en-IN' };
    synth.getVoices.mockReturnValue([{ lang: 'en-US' }, en, hi]);
    const out = new WebSpeechOutput();
    out.speak('नमस्ते।', 'hi');
    expect((synth.speak.mock.calls[0]?.[0] as FakeUtterance).voice).toBe(hi);
    out.speak('Hello.', 'en');
    expect((synth.speak.mock.calls[1]?.[0] as FakeUtterance).voice).toBe(en);
  });

  it('still speaks with the default voice when no Hindi voice exists', () => {
    install();
    synth.getVoices.mockReturnValue([{ lang: 'en-US' }]);
    new WebSpeechOutput().speak('नमस्ते।', 'hi');
    const u = synth.speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(u.voice).toBeNull();
    expect(u.lang).toBe('hi-IN');
  });

  it('cancel stops speech; the Hindi danda splits sentences', () => {
    install();
    new WebSpeechOutput().cancel();
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(firstSentences('एक। दो। तीन। चार।')).toBe('एक। दो। तीन।');
  });
});
