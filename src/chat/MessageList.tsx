import { useT } from '../i18n/i18n';
import type { ChatMessage } from '../types';
import styles from './chat.module.css';

interface Props {
  messages: ChatMessage[];
  thinking: boolean;
}

// Assistant text is rendered as plain text only.
export function MessageList({ messages, thinking }: Props) {
  const tr = useT();
  return (
    <ul role="log" aria-live="polite" aria-label={tr('chat.title')} className={styles.log}>
      {messages.length === 0 && <li className={styles.model}>{tr('chat.welcome')}</li>}
      {messages.map((m, i) => (
        <li key={i} className={m.role === 'user' ? styles.user : styles.model}>
          <strong className={styles.who}>
            {m.role === 'user' ? tr('chat.you') : tr('chat.assistant')}
          </strong>{' '}
          {m.text}
        </li>
      ))}
      {thinking && <li className={styles.model}>{tr('chat.thinking')}</li>}
    </ul>
  );
}
