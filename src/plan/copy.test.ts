import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import hi from '../i18n/hi.json';
import { t } from '../i18n/i18n';
import type { Lang } from '../types';
import { adviceText, formatHour, paramText, reasonText, tipText } from './copy';

const tr =
  (lang: Lang) =>
  (key: string, params?: Record<string, string | number>): string =>
    t(key, params, lang);

// Every key the engine can emit as text (advice, reason, tip, swap why, band, mode, period, pollutant).
const ENGINE_KEYS = [
  'advice.goAt',
  'advice.goAhead',
  'advice.mask',
  'advice.maskTomorrow',
  'advice.goAheadTomorrow',
  'advice.moveIndoors',
  'advice.skipToday',
  'advice.stayIndoorsUntil',
  'reason.goAt',
  'reason.goAhead',
  'reason.mask',
  'reason.maskTomorrow',
  'reason.goAheadTomorrow',
  'reason.moveIndoors',
  'reason.stayIndoorsUntil',
  'lateInDay',
  'tip.airOut',
  'tip.airOutUnavailable',
  'tip.windowsShut',
  'tip.purifierNight',
  'tip.exhaustCooking',
  'tip.noIncense',
  'swap.metro',
  'swap.bus',
  'swap.carpool',
  'swap.walk',
  'swap.cycle',
  'band.good',
  'band.satisfactory',
  'band.moderate',
  'band.poor',
  'band.veryPoor',
  'band.severe',
  'mode.petrolCar',
  'mode.dieselCar',
  'mode.cngAuto',
  'mode.twoWheeler',
  'mode.bus',
  'mode.metro',
  'mode.walk',
  'mode.cycle',
  'mode.carpool',
  'period.morning',
  'period.afternoon',
  'period.evening',
  'pollutant.pm25',
  'pollutant.pm10',
  'word.later',
];

describe('engine text keys', () => {
  it.each(ENGINE_KEYS)('%s exists in English and Hindi', (key) => {
    expect(Object.hasOwn(en, key)).toBe(true);
    expect(Object.hasOwn(hi, key)).toBe(true);
  });
});

describe('formatHour', () => {
  it('renders hours as H:00 without padding', () => {
    expect(formatHour(8)).toBe('8:00');
    expect(formatHour(17)).toBe('17:00');
  });
});

describe('paramText', () => {
  it('formats hours, translates band names and passes other values through', () => {
    expect(paramText({ hour: 17, band: 'poor', pm25: 150 }, tr('en'))).toEqual({
      hour: '17:00',
      band: 'Poor',
      pm25: '150',
    });
  });

  it('turns the word later into a translated phrase', () => {
    expect(paramText({ hour: 'later' }, tr('en'))).toEqual({ hour: 'the air improves' });
  });
});

describe('plan item text', () => {
  it('fills advice and reason with formatted parameters', () => {
    const item = {
      activityIndex: null,
      startHour: 8,
      adviceKey: 'goAt',
      reasonKey: 'reason.goAt',
      params: { hour: 8 },
    };
    expect(adviceText(item, tr('en'))).toBe('Go out at 8:00');
    expect(reasonText(item, tr('en'))).toBe('The air is expected to be cleaner at that time.');
  });

  it('uses the translated later phrase in stay-indoors advice', () => {
    const item = {
      activityIndex: null,
      startHour: 9,
      adviceKey: 'stayIndoorsUntil',
      reasonKey: 'reason.stayIndoorsUntil',
      params: { hour: 'later', band: 'severe' },
    };
    expect(adviceText(item, tr('en'))).toBe('Stay indoors until the air improves');
    expect(reasonText(item, tr('en'))).toBe('The air is Severe now and is expected to improve.');
  });
});

describe('tipText', () => {
  it('renders tip hours in the H:00 style', () => {
    expect(tipText({ key: 'airOut', params: { from: 6, to: 9 } }, tr('en'))).toBe(
      'Air the house from 6:00 to 9:00.',
    );
  });
});
