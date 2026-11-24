import type { Lang } from '../types';
import { SPEECH_LOCALE, type SpeechErrorCode, type SpeechInput } from './types';

// The Web Speech types are not in lib.dom for every browser, so only what is used is declared.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface ResultEvent {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
type Ctor = new () => Recognition;
type Listener = (arg: never) => void;

function findCtor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function mapError(error: string): SpeechErrorCode {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'not-allowed';
  if (error === 'no-speech' || error === 'network') return error;
  return 'other';
}

export class WebSpeechInput implements SpeechInput {
  private listeners = new Map<string, Set<Listener>>();
  private recognition: Recognition | null = null;

  isSupported(): boolean {
    return findCtor() !== undefined;
  }

  private emit(event: string, arg?: unknown) {
    this.listeners.get(event)?.forEach((cb) => (cb as (a: unknown) => void)(arg));
  }

  start(lang: Lang): void {
    const Ctor = findCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LOCALE[lang];
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(' ')
        .trim();
      const last = e.results[e.results.length - 1];
      if (text) this.emit(last?.isFinal ? 'final' : 'partial', text);
    };
    r.onerror = (e) => this.emit('error', mapError(e.error));
    r.onend = () => this.emit('end');
    this.recognition = r;
    try {
      r.start();
    } catch {
      this.emit('error', 'other');
    }
  }

  stop(): void {
    this.recognition?.stop();
  }

  on(event: 'partial' | 'final', cb: (text: string) => void): () => void;
  on(event: 'error', cb: (code: SpeechErrorCode) => void): () => void;
  on(event: 'end', cb: () => void): () => void;
  on(event: string, cb: Listener): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(cb);
    this.listeners.set(event, set);
    return () => {
      set.delete(cb);
    };
  }
}
