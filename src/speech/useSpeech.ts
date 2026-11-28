import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n/i18n';
import type { SpeechErrorCode, SpeechInput, SpeechOutput } from './types';
import { WebSpeechInput } from './WebSpeechInput';
import { WebSpeechOutput } from './WebSpeechOutput';

const MUTE_KEY = 'saans.muted';
// Silent rounds in a row before live mode pauses itself instead of listening forever.
const MAX_QUIET_ROUNDS = 2;

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
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<SpeechErrorCode | null>(null);
  const [muted, setMuted] = useState(readMuted);
  // Live mode: Saans speaks, then listens, then speaks again, until the user ends it.
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const round = useRef({ heard: false, error: null as SpeechErrorCode | null, manual: false });
  const quiet = useRef(0);
  // Each utterance gets a number; only the newest one may hand the turn back to the mic.
  const utterance = useRef(0);
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  });

  const listen = useCallback(() => {
    utterance.current += 1;
    output.cancel();
    setSpeaking(false);
    setError(null);
    round.current = { heard: false, error: null, manual: false };
    setListening(true);
    input.start(lang);
  }, [input, lang, output]);
  const listenRef = useRef(listen);
  useEffect(() => {
    listenRef.current = listen;
  });

  const stopLive = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    round.current.manual = true;
    input.stop();
    utterance.current += 1;
    output.cancel();
    setSpeaking(false);
  }, [input, output]);

  useEffect(() => {
    const offs = [
      input.on('partial', setCaption),
      input.on('final', (text) => {
        round.current.heard = true;
        quiet.current = 0;
        setCaption('');
        finalRef.current(text);
      }),
      input.on('error', (code) => {
        round.current.error = code;
        // In live mode a silent round is normal; it just listens again.
        if (!(liveRef.current && code === 'no-speech')) setError(code);
      }),
      input.on('end', () => {
        setListening(false);
        setCaption('');
        const r = round.current;
        if (!liveRef.current || r.heard || r.manual) return;
        if (r.error && r.error !== 'no-speech') {
          liveRef.current = false;
          setLive(false);
          return;
        }
        quiet.current += 1;
        if (quiet.current <= MAX_QUIET_ROUNDS) listenRef.current();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [input]);

  const toggle = useCallback(() => {
    if (listening) {
      round.current.manual = true;
      input.stop();
      return;
    }
    listen();
  }, [input, listen, listening]);

  // Starts live mode. `opening` runs when the chat is empty so Saans can greet first; otherwise it listens.
  const startLive = useCallback(
    (opening?: () => void) => {
      liveRef.current = true;
      quiet.current = 0;
      setLive(true);
      if (opening) opening();
      else listen();
    },
    [listen],
  );

  // The orb: interrupt Saans mid-sentence, pause the mic, or start listening again.
  const tapOrb = useCallback(() => {
    if (listening) {
      round.current.manual = true;
      input.stop();
    } else {
      quiet.current = 0;
      listen();
    }
  }, [input, listen, listening]);

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
      const id = ++utterance.current;
      const after = () => {
        if (id !== utterance.current) return;
        setSpeaking(false);
        if (liveRef.current) listenRef.current();
      };
      // Never talk over an open mic (a chip tapped mid-listen): close it first.
      round.current.manual = true;
      input.stop();
      if (muted || !output.isSupported()) return after();
      setSpeaking(true);
      output.speak(text, lang, after);
    },
    [input, lang, muted, output],
  );

  const cancel = useCallback(() => {
    utterance.current += 1;
    output.cancel();
    setSpeaking(false);
  }, [output]);

  return {
    micSupported: input.isSupported(),
    voiceSupported: output.isSupported(),
    listening,
    speaking,
    caption,
    error,
    muted,
    live,
    toggle,
    toggleMuted,
    speak,
    cancel,
    startLive,
    stopLive,
    tapOrb,
  };
}

export type Speech = ReturnType<typeof useSpeech>;
