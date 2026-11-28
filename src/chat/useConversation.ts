import { useCallback, useRef, useState } from 'react';
import { t, useLang } from '../i18n/i18n';
import {
  ProfileSchema,
  type AssistantTurn,
  type ChatMessage,
  type Lang,
  type Profile,
} from '../types';

export type Assistant = (input: {
  messages: ChatMessage[];
  profile: Profile;
  lang: Lang;
  now: Date;
  // The previous turn, so the no-key assistant can avoid repeating itself; Gemini ignores it.
  prev?: AssistantTurn | null;
}) => Promise<AssistantTurn>;

const STORAGE_KEY = 'saans.profile';
const WINDOW = 12;
const EMPTY_PROFILE: Profile = { household: [], activities: [] };

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = ProfileSchema.safeParse(raw === null ? null : JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}

function saveProfile(profile: Profile | null) {
  try {
    if (profile) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the profile still holds for this page view.
  }
}

export function useConversation(assistant: Assistant) {
  const { lang } = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfileState] = useState<Profile>(loadProfile);
  const [turn, setTurn] = useState<AssistantTurn | null>(null);
  const [lastGood, setLastGood] = useState<AssistantTurn | null>(null);
  const [turnAt, setTurnAt] = useState(() => new Date());
  const [status, setStatus] = useState<'idle' | 'thinking'>('idle');
  const busy = useRef(false);

  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    saveProfile(next);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy.current) return;
      busy.current = true;
      const withUser = [...messages, { role: 'user' as const, text: clean.slice(0, 500) }].slice(
        -WINDOW,
      );
      setMessages(withUser);
      setStatus('thinking');
      const now = new Date();
      try {
        const result = await assistant({ messages: withUser, profile, lang, now, prev: turn });
        setTurn(result);
        if (result.air) setLastGood(result);
        setTurnAt(now);
        setProfile(result.profile);
        // Model text is capped to the schema limit so it can be sent back as context.
        const reply = { role: 'model' as const, text: result.reply.slice(0, 500) };
        setMessages([...withUser, reply].slice(-WINDOW));
      } catch {
        setMessages(
          [...withUser, { role: 'model' as const, text: t('chat.error', {}, lang) }].slice(-WINDOW),
        );
      } finally {
        busy.current = false;
        setStatus('idle');
      }
    },
    [assistant, lang, messages, profile, setProfile, turn],
  );

  // Live mode opens with Saans speaking first; only on an empty chat.
  const greet = useCallback((text: string) => {
    setMessages((m) => (m.length === 0 ? [{ role: 'model', text }] : m));
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setTurn(null);
    setLastGood(null);
    setProfileState(EMPTY_PROFILE);
    saveProfile(null);
  }, []);

  return { messages, profile, turn, lastGood, turnAt, status, send, setProfile, reset, greet };
}
