import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/i18n';
import styles from './KeyDialog.module.css';
import { keyStore } from './keyStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onChange: (hasKey: boolean) => void;
}

const KEY_URL = 'https://aistudio.google.com/apikey';

// A native modal dialog: the browser traps focus inside it and the rest of the page is inert.
export function KeyDialog({ open, onClose, onChange }: Props) {
  const tr = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const [tooShort, setTooShort] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function finish() {
    setValue('');
    setTooShort(false);
    onClose();
  }

  function save() {
    if (!keyStore.set(value)) {
      setTooShort(true);
      return;
    }
    onChange(true);
    finish();
  }

  function remove() {
    keyStore.clear();
    onChange(false);
    finish();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="key-title"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') finish();
      }}
    >
      <h2 id="key-title">{tr('key.title')}</h2>
      <p>
        <a href={KEY_URL} target="_blank" rel="noopener noreferrer">
          {tr('key.get')}
        </a>
      </p>
      <label htmlFor="key-input">{tr('key.label')}</label>
      <input
        id="key-input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        className={styles.input}
        value={value}
        aria-invalid={tooShort}
        aria-describedby={tooShort ? 'key-error key-privacy' : 'key-privacy'}
        onChange={(e) => {
          setValue(e.target.value);
          setTooShort(false);
        }}
      />
      {tooShort && (
        <p id="key-error" role="alert" className={styles.error}>
          {tr('key.tooShort')}
        </p>
      )}
      <p id="key-privacy" className={styles.note}>
        {tr('key.privacy')}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={save}>
          {tr('key.save')}
        </button>
        <button type="button" className={styles.button} onClick={remove}>
          {tr('key.remove')}
        </button>
        <button type="button" className={styles.button} onClick={finish}>
          {tr('key.skip')}
        </button>
      </div>
    </dialog>
  );
}
