import { lazy, Suspense } from 'react';
import pkg from '../package.json';
import styles from './App.module.css';
import { ChatInput } from './chat/ChatInput';
import { Chips } from './chat/Chips';
import { MessageList } from './chat/MessageList';
import { useConversation, type Assistant } from './chat/useConversation';
import { createAirService } from './data/airService';
import { searchIndia } from './data/geocode';
import { useLang, useT } from './i18n/i18n';
import { createDegradedAssistant } from './llm/degradedAssistant';
import { AqiCard, type AirStatus } from './plan/AqiCard';

// The plan screen is only needed once the plan column is shown, so it loads on demand.
const PlanView = lazy(() => import('./plan/PlanView'));

// placeholder: replace with the repository URL before launch
const REPO_URL = 'https://github.com/';
// The one place the assistant is chosen; a later task swaps in the Gemini-backed one.
const defaultAssistant = createDegradedAssistant({ geocode: searchIndia, air: createAirService() });
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

export function App({ assistant = defaultAssistant }: { assistant?: Assistant }) {
  const tr = useT();
  const { messages, turn, lastGood, turnAt, status, send } = useConversation(assistant);
  const thinking = status === 'thinking';

  // A turn with no air and no failure (picking a place, not found) keeps showing the last good reading.
  const shown = turn && !turn.air && !turn.notice ? lastGood : turn;
  let airStatus: AirStatus = 'idle';
  if (thinking) airStatus = 'loading';
  else if (shown?.air) airStatus = 'ready';
  else if (shown?.notice === 'airUnavailable') airStatus = 'unavailable';

  function pick(label: string) {
    void send(label);
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
        <LanguageToggle />
      </header>
      <main id="main" tabIndex={-1} className={styles.layout}>
        <section aria-labelledby="chat-heading" className={styles.card}>
          <h2 id="chat-heading">{tr('chat.title')}</h2>
          <MessageList messages={messages} thinking={thinking} />
          <Chips items={turn?.chips ?? []} onPick={pick} />
          <ChatInput onSend={(text) => void send(text)} busy={thinking} />
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
