import { describe, expect, it } from 'vitest';
import { bandFor, computeAqi } from '../engine/aqi';
import { DEFAULT_TRIP_KM } from '../engine/constants';
import { tripCo2Kg } from '../engine/emissions';
import { round, tripExposureUg } from '../engine/impact';
import type { AirReading, Forecast, Profile } from '../types';
import { allowedNumbers, guardReply, readings } from './numberGuard';
import { answerFollowUp, followUpKind } from './followUps';

const air: AirReading = {
  aqi: 177,
  band: 'moderate',
  pm25: 80,
  pm10: 130,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: '2026-11-22T02:00:00.000Z',
  fetchedAt: '2026-11-22T02:00:00.000Z',
  isModelled: true,
  isStale: false,
};
const hours = (at5: number | null, others = 100): Forecast['hours'] =>
  Array.from({ length: 24 }, (_, h) => ({
    time: `2026-11-22T${String(h).padStart(2, '0')}:00`,
    pm25: h === 17 ? at5 : h === 20 ? 30 : others,
  }));
const forecast = (at5: number | null): Forecast => ({
  hours: hours(at5),
  source: 'CAMS via Open-Meteo',
  fetchedAt: air.fetchedAt,
});
const adult = { group: 'adult' as const, respiratory: false, pregnant: false };
const commute = {
  kind: 'commute' as const,
  mode: 'petrolCar' as const,
  participants: [0],
  flexible: false,
};
const profile: Profile = { household: [adult], activities: [commute] };
const ctx = (over: Partial<Parameters<typeof answerFollowUp>[1]> = {}) => ({
  lang: 'en' as const,
  city: 'Delhi',
  air,
  forecast: forecast(45),
  profile,
  now: '2026-11-22T08:00',
  ...over,
});

describe('followUpKind', () => {
  it('recognises the three chips in both languages and nothing else', () => {
    expect(followUpKind('What if I work from home?')).toBe('workFromHome');
    expect(followUpKind('क्या मेरा बच्चा 5 बजे बाहर खेल सकता है?')).toBe('playAt5');
    expect(followUpKind('Explain the AQI')).toBe('explainAqi');
    expect(followUpKind('Delhi')).toBeNull();
  });
});

describe('playAt5', () => {
  it('says yes when 17:00 is within the cautious limit', () => {
    const r = answerFollowUp('playAt5', ctx()).reply;
    expect(bandFor(computeAqi(45, null)?.aqi ?? 0)).toBe('satisfactory');
    expect(r).toMatch(/^Yes/);
    expect(r).toContain('Satisfactory');
  });

  it('says no with the band and the best window when 17:00 is too polluted', () => {
    const r = answerFollowUp('playAt5', ctx({ forecast: forecast(95) })).reply;
    expect(r).toMatch(/^Not at 5 pm/);
    expect(r).toContain('Poor');
    expect(r).toContain('20:00');
    expect(r).toContain('Good');
  });

  it('offers no window when the whole day is polluted', () => {
    const f = { ...forecast(95), hours: hours(95, 300).map((h) => ({ ...h, pm25: 300 })) };
    const r = answerFollowUp('playAt5', ctx({ forecast: f })).reply;
    expect(r).toContain('no good outdoor window');
    expect(r).toContain("doctor's advice");
  });

  it('is honest when 5 pm has passed or the forecast is missing', () => {
    const late = answerFollowUp('playAt5', ctx({ now: '2026-11-22T18:00' })).reply;
    expect(late).toContain('5 pm has passed today');
    expect(answerFollowUp('playAt5', ctx({ forecast: null })).reply).toContain('no forecast');
    const gap = answerFollowUp('playAt5', ctx({ forecast: forecast(null) })).reply;
    expect(gap).toContain('no forecast');
  });
});

describe('workFromHome', () => {
  it('reports the engine dose and CO2 for the default 12 km commute and drops it from the plan', () => {
    const { reply, plan } = answerFollowUp('workFromHome', ctx());
    const dose = round(tripExposureUg(DEFAULT_TRIP_KM.commute, 'petrolCar', 80, 'adult'), 1);
    const co2 = round(tripCo2Kg(DEFAULT_TRIP_KM.commute, 'petrolCar'), 2);
    expect(reply).toContain(String(dose));
    expect(reply).toContain(String(co2));
    expect(plan?.lowEmissionRoutine).toEqual([]);
    expect(plan?.sustainableSwaps).toEqual([]);
  });

  it('says nothing changes without a commute, and skips the dose without PM2.5', () => {
    const none = answerFollowUp('workFromHome', ctx({ profile: { ...profile, activities: [] } }));
    expect(none.reply).toContain('changes nothing');
    const noPm = answerFollowUp('workFromHome', ctx({ air: { ...air, pm25: null } }));
    expect(noPm.reply).not.toContain('µg');
    expect(noPm.reply).toContain('CO₂');
  });
});

describe('explainAqi', () => {
  it('names the band, the scale, the dominant pollutant and the source', () => {
    const r = answerFollowUp('explainAqi', ctx()).reply;
    expect(r).toContain('Moderate');
    expect(r).toContain('PM2.5');
    expect(r).toContain('0 to 500');
    expect(r).toContain('modelled estimate from CAMS');
  });

  it('has a Devanagari version', () => {
    expect(answerFollowUp('explainAqi', ctx({ lang: 'hi' })).reply).toMatch(/[ऀ-ॿ]/);
  });
});

describe('numbers in follow-up replies', () => {
  it('only come from the turn data or the question itself', () => {
    const extra = [
      17,
      5,
      round(tripExposureUg(DEFAULT_TRIP_KM.commute, 'petrolCar', 80, 'adult'), 1),
      round(tripCo2Kg(DEFAULT_TRIP_KM.commute, 'petrolCar'), 2),
    ];
    for (const kind of ['playAt5', 'workFromHome', 'explainAqi'] as const) {
      for (const f of [forecast(45), forecast(95)]) {
        const turn = { air, forecast: f };
        const r = answerFollowUp(kind, ctx({ forecast: f })).reply;
        expect(guardReply(r, allowedNumbers(turn, extra), readings(turn)).guarded, r).toBe(false);
      }
    }
  });
});
