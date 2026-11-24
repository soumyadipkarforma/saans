import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useT } from '../i18n/i18n';
import styles from './chat.module.css';

export const MAX_CHARS = 500;

interface Props {
  onSend: (text: string) => void;
  busy?: boolean;
  // A new object each time, so picking the same sentence twice still refills the box.
  fill?: { text: string } | null;
}

export function ChatInput({ onSend, busy = false, fill = null }: Props) {
  const tr = useT();
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const canSend = value.trim() !== '' && !busy;

  // Adjust state while rendering when a new fill arrives (no effect needed), then focus the box.
  const [seen, setSeen] = useState(fill);
  if (fill !== seen) {
    setSeen(fill);
    if (fill) setValue(fill.text.slice(0, MAX_CHARS));
  }
  useEffect(() => {
    if (fill) input.current?.focus();
  }, [fill]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    input.current?.focus();
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label htmlFor="chat-input" className={styles.inputLabel}>
        {tr('chat.inputLabel')}
      </label>
      <div className={styles.row}>
        <input
          id="chat-input"
          ref={input}
          type="text"
          autoComplete="off"
          maxLength={MAX_CHARS}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby="chat-counter"
          className={styles.input}
        />
        <button type="submit" disabled={!canSend} className={styles.send}>
          {tr('chat.send')}
        </button>
      </div>
      <p id="chat-counter" className={styles.counter}>
        {tr('chat.counter', { n: value.length, max: MAX_CHARS })}
      </p>
    </form>
  );
}
