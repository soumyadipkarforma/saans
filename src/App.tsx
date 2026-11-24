import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../package.json';
import styles from './App.module.css';
import { ChatInput } from './chat/ChatInput';
import { Chips } from './chat/Chips';
import { MessageList } from './chat/MessageList';
import { useConversation, type Assistant } from './chat/useConversation';
import { createAirService } from './data/airService';
import { searchIndia } from './data/geocode';
import { useLang, useT } from './i18n/i18n';
import { KeyDialog } from './key/KeyDialog';
import { keyStore } from './key/keyStore';
import { createAssistant } from './llm/assistant';
import { AqiCard, type AirStatus } from './plan/AqiCard';
import { MicButton } from './speech/MicButton';
import { useSpeech } from './speech/useSpeech';
import type { ChatMessage } from './types';

// The plan screen is only needed once the plan column is shown, so it loads on demand.
const PlanView = lazy(() => import('./plan/PlanView'));

// placeholder: replace with the repository URL before launch
const REPO_URL = 'https://github.com/';
const airService = createAirService();
const LANGS = ['en', 'hi'] as const;

function LanguageToggle() {
  const { lang, setLang } = useLang();
  const tr = useT();
  return (
    <div role="group" aria-label={tr('header.language')} className={styles.toggle}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          lang={code}
          className={styles.toggleButton}
          onClick={() => setLang(code)}
        >
          {tr(`lang.${code}`)}
        </button>
      ))}
    </div>
  );
}

export function App({ assistant: injected }: { assistant?: Assistant }) {
  const tr = useT();
  const [keyOpen, setKeyOpen] = useState(false);
  const [hasKey, setHasKey] = useState(() => keyStore.get() !== null);
  const aiButton = useRef<HTMLButtonElement>(null);
  // The one place the assistant is chosen: Gemini when a key is set, the template one otherwise.
  const assistant = useMemo(
    () =>
      injected ??
      createAssistant({
        geocode: searchIndia,
        air: airService,
        keys: keyStore,
        onKeyInvalid: () => {
          setHasKey(false);
          setKeyOpen(true);
        },
      }),
    [injected],
  );
  const { messages, turn, lastGood, turnAt, status, send } = useConversation(assistant);
  const thinking = status === 'thinking';
  const speech = useSpeech((text) => void send(text));
  const { speak, cancel: stopSpeaking, error: micError } = speech;

  // Speak each new assistant reply once; chip labels and user text are never spoken.
  const spoken = useRef<ChatMessage | null>(null);
  useEffect(() => {
    const last = messages.at(-1);
    if (last?.role !== 'model' || last === spoken.current) return;
    spoken.current = last;
    speak(last.text);
  }, [messages, speak]);

  useEffect(() => {
    if (micError === 'not-allowed') document.getElementById('chat-input')?.focus();
  }, [micError]);

  // Every typed or tapped message silences the voice first.
  function say(text: string) {
    stopSpeaking();
    void send(text);
  }

  // A turn with no air and no failure (picking a place, not found) keeps showing the last good reading.
  const shown = turn && !turn.air && turn.notice !== 'airUnavailable' ? lastGood : turn;
  let airStatus: AirStatus = 'idle';
  if (thinking) airStatus = 'loading';
  else if (shown?.air) airStatus = 'ready';
  else if (shown?.notice === 'airUnavailable') airStatus = 'unavailable';

  function pick(label: string) {
    say(label);
    // The chip that was clicked is replaced by the next set, so hand focus back to the input.
    document.getElementById('chat-input')?.focus();
  }

  return (
    <>
      <a className="skip-link" href="#main">
        {tr('skip.toMain')}
      </a>
      <header className={styles.header}>
        <h1>{tr('app.name')}</h1>
        <div className={styles.headerTools}>
          <button
            ref={aiButton}
            type="button"
            aria-haspopup="dialog"
            className={styles.aiButton}
            onClick={() => setKeyOpen(true)}
          >
            {tr(hasKey ? 'header.aiOn' : 'header.aiOff')}
          </button>
          <LanguageToggle />
        </div>
      </header>
      <KeyDialog
        open={keyOpen}
        onChange={setHasKey}
        onClose={() => {
          setKeyOpen(false);
          aiButton.current?.focus();
        }}
      />
      <main id="main" tabIndex={-1} className={styles.layout}>
        <section aria-labelledby="chat-heading" className={styles.card}>
          <h2 id="chat-heading">{tr('chat.title')}</h2>
          <MessageList messages={messages} thinking={thinking} />
          {turn?.notice && turn.notice !== 'airUnavailable' && (
            <p role="status" className={styles.muted}>
              {tr(`notice.${turn.notice}`)}
            </p>
          )}
          <Chips items={turn?.chips ?? []} onPick={pick} />
          <MicButton speech={speech} />
          <ChatInput onSend={say} busy={thinking} />
        </section>
        <div className={styles.plan}>
          <AqiCard
            air={shown?.air ?? null}
            status={airStatus}
            now={turnAt}
            city={shown?.profile.location?.city}
          />
          {shown?.plan && (
            <Suspense fallback={<p>{tr('plan.loading')}</p>}>
              <PlanView plan={shown.plan} activities={shown.profile.activities} />
            </Suspense>
          )}
        </div>
      </main>
      <footer className={styles.footer}>
        <p>{tr('footer.airData')}</p>
        <p>{tr('footer.version', { version: pkg.version })}</p>
        <p>{tr('footer.notMedical')}</p>
        <p>
          <a href={REPO_URL}>{tr('footer.github')}</a>
        </p>
      </footer>
    </>
  );
}
