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

function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | undefined {
  const order = lang === 'hi' ? ['hi'] : ['en-in', 'en-gb', 'en'];
  for (const prefix of order) {
    const v = voices.find((x) => norm(x.lang).startsWith(prefix));
    if (v) return v;
  }
  return undefined;
}

export class WebSpeechOutput implements SpeechOutput {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Chrome loads voices late; asking once warms the list before the first reply.
    if (supported()) window.speechSynthesis.getVoices();
  }

  isSupported(): boolean {
    return supported();
  }

  speak(text: string, lang: Lang): void {
    if (!supported()) return;
    const synth = window.speechSynthesis;
    const busy = synth.speaking || synth.pending;
    this.cancel();
    const u = new SpeechSynthesisUtterance(firstSentences(forSpeech(text)));
    u.lang = SPEECH_LOCALE[lang];
    const voice = pickVoice(synth.getVoices(), lang);
    if (voice) u.voice = voice;
    // Chrome drops an utterance queued in the same tick as cancel(); wait a beat.
    if (busy) this.timer = setTimeout(() => synth.speak(u), 80);
    else synth.speak(u);
  }

  cancel(): void {
    clearTimeout(this.timer);
    if (supported()) window.speechSynthesis.cancel();
  }
}
