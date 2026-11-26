import { describe, expect, it } from 'vitest';
import { DEMO_FAMILIES } from '../demo/families';
import type { DayPlan, Profile, Swap } from '../types';
import { answerPlanIntent, planIntent } from './planAnswers';

const adult = { group: 'adult' as const, respiratory: false, pregnant: false };
const swap: Swap = {
  activityIndex: 0,
  fromMode: 'petrolCar',
  toMode: 'metro',
  impact: { exposureSavedUg: 4, exposureSavedPct: 35, co2SavedKg: 1.8 },
  whyKey: 'swap.metro',
};
const profile: Profile = {
  household: [adult],
  activities: [
    { kind: 'commute', mode: 'petrolCar', participants: [0], flexible: false },
    { kind: 'exercise', label: 'jog', participants: [0], flexible: true },
    { kind: 'walk', participants: [0], flexible: true },
  ],
};
const item = (activityIndex: number, startHour: number, adviceKey: string) => ({
  activityIndex,
  startHour,
  adviceKey,
  reasonKey: `reason.${adviceKey}`,
  params: { band: 'moderate', hour: startHour },
});
const plan = (over: Partial<DayPlan> = {}): DayPlan => ({
  lowEmissionRoutine: [
    { period: 'morning', items: [item(2, 7, 'goAt'), item(0, 9, 'mask')] },
    { period: 'evening', items: [item(1, 18, 'goAt')] },
  ],
  sustainableSwaps: [swap],
  indoorAirTips: [{ key: 'exhaustCooking', params: {} }],
  sensitive: false,
  ...over,
});
const ask = (
  intent: 'today' | 'swap' | 'bestTime',
  text: string,
  p = plan(),
  lang = 'en' as const,
) => answerPlanIntent(intent, { lang, plan: p, profile, text });

describe('planIntent', () => {
  it.each([
    ['What does today look like for my family?', 'today'],
    ['Which swap would help us the most?', 'swap'],
    ['When is the best time for our evening jog?', 'bestTime'],
    ['When should we go for our morning walk?', 'bestTime'],
    ['आज का दिन कैसा रहेगा?', 'today'],
    ['कौन सा बदलाव हमारे लिए सबसे अच्छा है?', 'swap'],
    ['सैर के लिए सबसे अच्छा समय कब है?', 'bestTime'],
    ['Should my child play outside at 5 pm?', null],
    ['क्या मेरा बच्चा शाम 5 बजे बाहर खेल सकता है?', null],
    ['Why is the air bad today?', null],
  ])('%s', (text, expected) => expect(planIntent(text)).toBe(expected));

  it('every demo script question is answered by code', () => {
    for (const f of DEMO_FAMILIES) for (const q of f.script) expect(planIntent(q)).not.toBeNull();
  });
});

describe('answerPlanIntent', () => {
  it('today: first routine item with hour, then the top at-home tip', () => {
    const r = ask('today', '');
    expect(r).toContain('Walk at 7:00');
    expect(r).toContain('Go out at 7:00');
    expect(r).toContain('At home: Cook with the kitchen exhaust fan');
  });

  it('today: no routine and no tips', () => {
    const empty = plan({ lowEmissionRoutine: [], indoorAirTips: [] });
    expect(ask('today', '', empty)).toBe('Your plan has no timed activity yet.');
    const noTip = plan({ indoorAirTips: [] });
    expect(ask('today', '', noTip)).not.toContain('At home');
  });

  it('swap: the top swap with the numbers the SwapCard shows', () => {
    const r = ask('swap', '');
    expect(r).toContain('Commute');
    expect(r).toContain('35% less smog inhaled');
    expect(r).toContain('1.8 kg CO₂ saved');
    expect(ask('swap', '', plan({ sustainableSwaps: [] }))).toBe('No swaps to suggest today.');
  });

  it('best time: matches the activity named and gives its hour and band', () => {
    expect(ask('bestTime', 'best time for our evening jog')).toContain('jog today: 18:00');
    expect(ask('bestTime', 'when should we go for our morning walk')).toContain('walk today: 7:00');
    expect(ask('bestTime', 'best time to play')).toContain('Moderate');
  });

  it('best time: honest answers for no window, too late and no activity', () => {
    const indoors = plan({
      lowEmissionRoutine: [{ period: 'evening', items: [item(1, 18, 'moveIndoors')] }],
    });
    expect(ask('bestTime', 'best time for a jog', indoors)).toContain('move it indoors');
    const late = plan({
      lowEmissionRoutine: [{ period: 'evening', items: [item(1, 20, 'skipToday')] }],
    });
    expect(ask('bestTime', 'best time for a jog', late)).toContain('too late');
    const none = plan({ lowEmissionRoutine: [{ period: 'morning', items: [item(0, 9, 'mask')] }] });
    expect(ask('bestTime', 'best time for a jog', none)).toContain('no walk, jog or play');
  });

  it('answers in Devanagari for Hindi', () => {
    for (const intent of ['today', 'swap', 'bestTime'] as const) {
      expect(ask(intent, 'jog', plan(), 'hi' as 'en')).toMatch(/[\u0900-\u097F]/);
    }
    expect(ask('swap', '', plan(), 'hi' as 'en')).toContain('35%');
  });
});
