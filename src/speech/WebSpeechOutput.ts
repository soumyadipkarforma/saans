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

export class WebSpeechOutput implements SpeechOutput {
  isSupported(): boolean {
    return supported();
  }

  speak(text: string, lang: Lang): void {
    if (!supported()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(firstSentences(text));
    u.lang = SPEECH_LOCALE[lang];
    const prefix = lang === 'hi' ? 'hi' : 'en-IN';
    const voice = synth.getVoices().find((v) => v.lang.startsWith(prefix));
    if (voice) u.voice = voice;
    synth.speak(u);
  }

  cancel(): void {
    if (supported()) window.speechSynthesis.cancel();
  }
}
