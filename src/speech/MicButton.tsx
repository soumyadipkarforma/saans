import { useT } from '../i18n/i18n';
import styles from './MicButton.module.css';
import type { Speech } from './useSpeech';

// The live-conversation control: one tap starts a hands-free talk, the orb shows whose turn it is.
export function MicButton({
  speech,
  thinking = false,
  onStart,
}: {
  speech: Speech;
  thinking?: boolean;
  onStart?: () => void;
}) {
  const tr = useT();
  const { micSupported, voiceSupported, listening, speaking, caption, error, muted, live } = speech;
  let state = 'live.paused';
  if (listening) state = 'live.listening';
  else if (thinking) state = 'live.thinking';
  else if (speaking) state = 'live.speaking';
  const mood = listening
    ? styles.listening
    : thinking
      ? styles.thinking
      : speaking
        ? styles.speaking
        : '';

  return (
    <div className={styles.wrap}>
      {!micSupported && <p className={styles.note}>{tr('mic.unsupported')}</p>}
      {micSupported && !live && (
        <>
          <button
            type="button"
            className={styles.start}
            onClick={() => (onStart ? onStart() : speech.startLive())}
          >
            <span aria-hidden="true" className={styles.dot} />
            {tr('live.start')}
          </button>
          <p className={styles.hint}>{tr('live.hint')}</p>
        </>
      )}
      {micSupported && live && (
        <>
          <button
            type="button"
            aria-label={`${tr('mic.label')}: ${tr(state)}`}
            className={`${styles.orb} ${mood}`}
            onClick={speech.tapOrb}
          >
            <span aria-hidden="true" className={styles.core} />
          </button>
          <p role="status" className={styles.state}>
            {tr(state)}
          </p>
          <button type="button" className={styles.mute} onClick={speech.stopLive}>
            {tr('live.end')}
          </button>
        </>
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
