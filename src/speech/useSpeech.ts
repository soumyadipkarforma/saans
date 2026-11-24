import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n/i18n';
import type { SpeechErrorCode, SpeechInput, SpeechOutput } from './types';
import { WebSpeechInput } from './WebSpeechInput';
import { WebSpeechOutput } from './WebSpeechOutput';

const MUTE_KEY = 'saans.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface SpeechIo {
  input: SpeechInput;
  output: SpeechOutput;
}

export function useSpeech(onFinal: (text: string) => void, io?: SpeechIo) {
  const { lang } = useLang();
  const { input, output } = useMemo(
    () => io ?? { input: new WebSpeechInput(), output: new WebSpeechOutput() },
    [io],
  );
  const [listening, setListening] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<SpeechErrorCode | null>(null);
  const [muted, setMuted] = useState(readMuted);
  // Latest callback without resubscribing to the recogniser on every render.
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  });

  useEffect(() => {
    const offs = [
      input.on('partial', setCaption),
      input.on('final', (text) => {
        setCaption('');
        finalRef.current(text);
      }),
      input.on('error', setError),
      input.on('end', () => {
        setListening(false);
        setCaption('');
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [input]);

  const toggle = useCallback(() => {
    if (listening) {
      input.stop();
      return;
    }
    output.cancel();
    setError(null);
    setListening(true);
    input.start(lang);
  }, [input, lang, listening, output]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (next) output.cancel();
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Storage blocked: the choice still holds for this page view.
    }
  }, [muted, output]);

  const speak = useCallback(
    (text: string) => {
      if (!muted) output.speak(text, lang);
    },
    [lang, muted, output],
  );

  return {
    micSupported: input.isSupported(),
    voiceSupported: output.isSupported(),
    listening,
    caption,
    error,
    muted,
    toggle,
    toggleMuted,
    speak,
    cancel: output.cancel.bind(output),
  };
}

export type Speech = ReturnType<typeof useSpeech>;
