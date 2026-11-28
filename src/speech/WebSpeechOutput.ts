import type { Lang } from '../types';
import { SPEECH_LOCALE, type SpeechOutput } from './types';

const MAX_SENTENCES = 3;

const supported = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// First three sentences only; the full text stays on screen.
export function firstSentences(text: string): string {
  return text
    .split(/(?<=[.!?।])\s+/)
    .slice(0, MAX_SENTENCES)
    .join(' ');
}

// Screen text reads badly aloud: drop the source note in brackets, spell out units.
export function forSpeech(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/µg\/m³/g, ' micrograms per cubic metre')
    .replace(/µg/g, ' micrograms')
    .replace(/CO₂/g, 'C O 2')
    .replace(/PM2\.5/g, 'P M 2.5')
    .replace(/(\d)\s?km\b/g, '$1 kilometres')
    .replace(/[*_#`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Android reports "en_IN"; desktop Chrome "en-IN".
const norm = (l: string) => l.replace('_', '-').toLowerCase();

// Voices on the device come first: Chrome's online "Google" voices often fail silently or cut out after
// about 15 seconds on desktop.
function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | undefined {
  const order = lang === 'hi' ? ['hi'] : ['en-in', 'en-gb', 'en'];
  const ranked = [...voices].sort((a, b) => Number(b.localService) - Number(a.localService));
  for (const prefix of order) {
    const v = ranked.find((x) => norm(x.lang).startsWith(prefix));
    if (v) return v;
  }
  return undefined;
}

// An online voice that has not started by then is treated as failed; the default voice takes over.
const START_TIMEOUT_MS = 2500;

export class WebSpeechOutput implements SpeechOutput {
  private timer: ReturnType<typeof setTimeout> | undefined;
  // Chrome can garbage-collect a playing utterance and never fire its end event; holding it prevents that.
  private readonly held = new Set<SpeechSynthesisUtterance>();

  constructor() {
    // Chrome loads voices late; asking once warms the list before the first reply.
    if (supported()) window.speechSynthesis.getVoices();
  }

  private hold(u: SpeechSynthesisUtterance) {
    this.held.clear();
    this.held.add(u);
  }

  isSupported(): boolean {
    return supported();
  }

  speak(text: string, lang: Lang, onEnd?: () => void): void {
    if (!supported()) {
      onEnd?.();
      return;
    }
    const synth = window.speechSynthesis;
    const busy = synth.speaking || synth.pending;
    this.cancel();
    const words = firstSentences(forSpeech(text));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(this.timer);
      onEnd?.();
    };
    const make = (voice?: SpeechSynthesisVoice) => {
      const u = new SpeechSynthesisUtterance(words);
      u.lang = SPEECH_LOCALE[lang];
      if (voice) {
        u.voice = voice;
        // Some engines stay silent when the language and the voice disagree (en-IN text, en-US voice).
        u.lang = voice.lang;
      }
      u.onend = finish;
      u.onerror = finish;
      return u;
    };
    const voice = pickVoice(synth.getVoices(), lang);
    const u = make(voice);
    const play = () => {
      this.hold(u);
      synth.speak(u);
      // Chrome on Windows can leave the engine paused after a cancel.
      if (synth.paused) synth.resume();
      if (voice?.localService === false) {
        let started = false;
        u.onstart = () => (started = true);
        this.timer = setTimeout(() => {
          if (started || done) return;
          // Detach first: cancelling fires the failed utterance's error event.
          u.onend = null;
          u.onerror = null;
          synth.cancel();
          const fallback = make();
          this.hold(fallback);
          synth.speak(fallback);
        }, START_TIMEOUT_MS);
      }
    };
    // Chrome drops an utterance queued in the same tick as cancel(); wait a beat.
    if (busy) this.timer = setTimeout(play, 80);
    else play();
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.held.clear();
    if (supported()) window.speechSynthesis.cancel();
  }
}
