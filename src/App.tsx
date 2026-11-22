import pkg from '../package.json';
import styles from './App.module.css';
import { useLang, useT } from './i18n/i18n';
import { AqiCard } from './plan/AqiCard';
import type { AirReading } from './types';

// placeholder: replace with the repository URL before launch
const REPO_URL = 'https://github.com/';
const LANGS = ['en', 'hi'] as const;

// shortcut: sample data until the assistant (Task 14+) is wired
const SAMPLE_NOW = new Date('2026-11-22T02:30:00Z'); // 08:00 IST
const SAMPLE_AIR: AirReading = {
  aqi: 223,
  band: 'poor',
  pm25: 150,
  pm10: 210,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: '28.61,77.21',
  observedAt: SAMPLE_NOW.toISOString(),
  fetchedAt: new Date(SAMPLE_NOW.getTime() - 12 * 60_000).toISOString(),
  isModelled: true,
  isStale: false,
};

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
          className={styles.toggleButton}
          onClick={() => setLang(code)}
        >
          {tr(`lang.${code}`)}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const tr = useT();
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
          <p className={styles.muted}>{tr('chat.placeholder')}</p>
        </section>
        <div className={styles.plan}>
          <AqiCard air={SAMPLE_AIR} status="ready" now={SAMPLE_NOW} city="Delhi" />
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
