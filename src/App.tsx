import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../package.json';
import styles from './App.module.css';
import { ChatInput } from './chat/ChatInput';
import { Chips } from './chat/Chips';
import { MessageList } from './chat/MessageList';
import { useConversation, type Assistant } from './chat/useConversation';
import { createAirService } from './data/airService';
import { DemoPicker } from './demo/DemoPicker';
import type { DemoFamily } from './demo/families';
import { TrySaying } from './demo/TrySaying';
import { useScript } from './demo/useScript';
import { searchIndia } from './data/geocode';
import { t, useLang, useT } from './i18n/i18n';
import { KeyDialog } from './key/KeyDialog';
import { keyStore } from './key/keyStore';
import { placeName } from './llm/area';
import { createAssistant } from './llm/assistant';
import { AqiCard, type AirStatus } from './plan/AqiCard';
import { MicButton } from './speech/MicButton';
import { useSpeech } from './speech/useSpeech';
import { LocationSchema, type ChatMessage } from './types';

// The plan screen is only needed once the plan column is shown, so it loads on demand.
const PlanView = lazy(() => import('./plan/PlanView'));

const REPO_URL = 'https://github.com/soumyadipkarforma/saans';
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
  const { messages, profile, turn, lastGood, turnAt, status, send, setProfile, reset, greet } =
    useConversation(assistant);
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

  const [fill, setFill] = useState<{ text: string } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const { run, running } = useScript({ profile, setProfile, say, idle: !thinking });

  // Resolve the family's city through the same assistant path as typing, then set the profile
  // and play the script, so the demo shows live data with or without an AI key.
  function startDemo(f: DemoFamily) {
    reset();
    run([
      { kind: 'say', text: f.placeLabel },
      { kind: 'say', text: f.area, wait: true },
      { kind: 'profile', apply: (p) => ({ ...p, ...f.profile }) },
      ...f.script.map((text) => ({ kind: 'say' as const, text, wait: true })),
    ]);
  }

  function locate() {
    if (!navigator.geolocation) return setLocMsg('loc.unsupported');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // The schema's India bounding box is the single place that decides "in India".
        const location = LocationSchema.safeParse({
          city: t('loc.yours'),
          // GPS is already precise, so Saans does not ask which part of the city.
          area: '',
          lat: coords.latitude,
          lon: coords.longitude,
        });
        if (!location.success) return setLocMsg('loc.outside');
        setLocMsg(null);
        run([
          { kind: 'profile', apply: (p) => ({ ...p, location: location.data }) },
          { kind: 'say', text: t('loc.ask') },
        ]);
      },
      () => setLocMsg('loc.denied'),
      { timeout: 10_000 },
    );
  }

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

          <ChatInput onSend={say} busy={thinking} fill={fill} />
          <MicButton
            speech={speech}
            thinking={thinking}
            onStart={() =>
              speech.startLive(messages.length === 0 ? () => greet(t('reply.greet')) : undefined)
            }
          />
          <DemoPicker onPick={startDemo} disabled={running || thinking} />
          {running && <p role="status">{tr('demo.playing')}</p>}
          <TrySaying onPick={(text) => setFill({ text })} />
          <button type="button" className={styles.aiButton} onClick={locate}>
            {tr('loc.button')}
          </button>
          {locMsg && <p role="status">{tr(locMsg)}</p>}
        </section>
        <div className={styles.plan}>
          <AqiCard
            air={shown?.air ?? null}
            status={airStatus}
            now={turnAt}
            city={shown?.profile.location && placeName(shown.profile.location)}
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
