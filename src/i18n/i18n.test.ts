import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from './en.json';
import hi from './hi.json';
import { t, useLang } from './i18n';

function resetLang() {
  const { result } = renderHook(() => useLang());
  act(() => result.current.setLang('en'));
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetLang();
});

describe('dictionaries', () => {
  it('en and hi have identical key sets', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  it('every Hindi value is Devanagari text, except the language name English', () => {
    const devanagari = /[ऀ-ॿ]/;
    const offenders = Object.entries(hi)
      .filter(([key, value]) => key !== 'lang.en' && !devanagari.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});

describe('t', () => {
  it('interpolates named parameters', () => {
    expect(t('footer.version', { version: '1.2.3' }, 'en')).toBe('Version 1.2.3');
  });

  it('returns the key when the key is missing', () => {
    expect(t('does.not.exist', {}, 'en')).toBe('does.not.exist');
  });

  it('does not treat inherited object properties as keys', () => {
    expect(t('constructor', {}, 'en')).toBe('constructor');
  });

  it('uses the current language when none is passed', () => {
    const { result } = renderHook(() => useLang());
    act(() => result.current.setLang('hi'));
    expect(t('app.name')).toBe(hi['app.name']);
  });
});

describe('useLang', () => {
  it('setLang updates the html lang attribute and persists the choice', () => {
    const { result } = renderHook(() => useLang());
    act(() => result.current.setLang('hi'));
    expect(result.current.lang).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(localStorage.getItem('saans.lang')).toBe('hi');
  });

  it('still switches language when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const { result } = renderHook(() => useLang());
    expect(() => act(() => result.current.setLang('hi'))).not.toThrow();
    expect(result.current.lang).toBe('hi');
  });
});
