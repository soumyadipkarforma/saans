import type { Lang } from '../types';

export type SpeechErrorCode = 'not-allowed' | 'no-speech' | 'network' | 'other';

export interface SpeechInput {
  isSupported(): boolean;
  start(lang: Lang): void;
  stop(): void;
  on(event: 'partial' | 'final', cb: (text: string) => void): () => void;
  on(event: 'error', cb: (code: SpeechErrorCode) => void): () => void;
  on(event: 'end', cb: () => void): () => void;
}

export interface SpeechOutput {
  isSupported(): boolean;
  // onEnd runs once when this utterance finishes or fails, not when a newer one replaces it.
  speak(text: string, lang: Lang, onEnd?: () => void): void;
  cancel(): void;
}

export const SPEECH_LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN' };
