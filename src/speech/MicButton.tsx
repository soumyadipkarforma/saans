import { useT } from '../i18n/i18n';
import styles from './MicButton.module.css';
import type { Speech } from './useSpeech';

export function MicButton({ speech }: { speech: Speech }) {
  const tr = useT();
  const { micSupported, voiceSupported, listening, caption, error, muted } = speech;
  return (
    <div className={styles.wrap}>
      {micSupported ? (
        <button
          type="button"
          aria-pressed={listening}
          aria-label={tr('mic.label')}
          className={`${styles.mic} ${listening ? styles.listening : ''}`}
          onClick={speech.toggle}
        >
          {tr(listening ? 'mic.listening' : 'mic.start')}
        </button>
      ) : (
        <p className={styles.note}>{tr('mic.unsupported')}</p>
      )}
      {voiceSupported && (
        <button
          type="button"
          aria-pressed={muted}
          className={styles.mute}
          onClick={speech.toggleMuted}
        >
          {tr('mic.mute')}
        </button>
      )}
      <p aria-live="polite" className={styles.caption}>
        {caption}
      </p>
      {error && (
        <p role="status" className={styles.note}>
          {tr(`mic.error.${error}`)}
        </p>
      )}
    </div>
  );
}
