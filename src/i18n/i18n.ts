import { useSyncExternalStore } from 'react';
import { LangSchema, type Lang } from '../types';
import en from './en.json';
import hi from './hi.json';

type Params = Record<string, string | number>;

const dictionaries: Record<Lang, Record<string, string>> = { en, hi };
const STORAGE_KEY = 'saans.lang';

function readStoredLang(): Lang {
  try {
    const parsed = LangSchema.safeParse(localStorage.getItem(STORAGE_KEY));
    return parsed.success ? parsed.data : 'en';
  } catch {
    return 'en';
  }
}

let currentLang: Lang = readStoredLang();
const listeners = new Set<() => void>();

function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
}
applyLang(currentLang);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setLang(lang: Lang) {
  currentLang = lang;
  applyLang(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage blocked: the choice still holds for this page view.
  }
  listeners.forEach((listener) => listener());
}

// Missing keys return the key itself so gaps show up on screen instead of crashing.
export function t(key: string, params: Params = {}, lang: Lang = currentLang): string {
  const dictionary = dictionaries[lang];
  const template = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function useLang(): { lang: Lang; setLang: (lang: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, () => currentLang);
  return { lang, setLang };
}

// Translator bound to the current language; re-renders the caller when the language changes.
export function useT(): (key: string, params?: Params) => string {
  const { lang } = useLang();
  return (key, params) => t(key, params, lang);
}
