import { describe, expect, it, vi } from 'vitest';
import { AQI_MAX } from '../engine/constants';
import { t } from '../i18n/i18n';
import { minutesSince } from '../time';
import type { AirReading, AssistantTurn, ChatMessage, Forecast, Location, Profile } from '../types';
import { createDegradedAssistant } from './degradedAssistant';

// The chip Saans offers right after a city is set: keep the whole city, no area.
const SKIP = t('chip.skipArea', {}, 'en');
import { allowedNumbers, guardReply } from './numberGuard';

const delhi: Location = { city: 'Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 };
const baseAir: AirReading = {
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
const forecast: Forecast = {
  hours: Array.from({ length: 24 }, (_, h) => ({
    time: `2026-11-22T${String(h).padStart(2, '0')}:00`,
    pm25: h === 17 ? 45 : 100,
  })),
  source: 'CAMS via Open-Meteo',
  fetchedAt: baseAir.fetchedAt,
};
const now = new Date('2026-11-22T02:12:00Z');

// Plays turns the way useConversation does: profile and previous turn are fed back in.
function chat() {
  let air = baseAir;
  const assistant = createDegradedAssistant({
    geocode: () => Promise.resolve([delhi]),
    air: { getAir: vi.fn(() => Promise.resolve({ air, forecast })) },
  });
  let profile: Profile = { household: [], activities: [] };
  let prev: AssistantTurn | null = null;
  const messages: ChatMessage[] = [];
  const log: string[] = [];
  return {
    log,
    setAir: (a: AirReading) => (air = a),
    async say(text: string, lang: 'en' | 'hi' = 'en') {
      messages.push({ role: 'user', text });
      const turn: AssistantTurn = await assistant({ messages, profile, lang, now, prev });
      messages.push({ role: 'model', text: turn.reply });
      profile = turn.profile;
      prev = turn;
      log.push(`> ${text}`, turn.reply, `  [${turn.chips.join(' | ')}]`);
      return turn;
    },
  };
}

describe('no-key conversation', () => {
  it('acknowledges the city, asks for the area, then one missing slot at a time, then offers follow-ups', async () => {
    const c = chat();
    const t1 = await c.say('Delhi');
    expect(t1.reply).toMatch(/^Delhi, got it\./);
    expect(t1.reply).toContain(
      'Air in Delhi is Moderate, AQI 177 (CAMS via Open-Meteo, modelled estimate, updated 12 min ago).',
    );
    expect(t1.reply).toContain('Which part of Delhi do you live in?');
    expect(t1.chips).toEqual([SKIP]);

    const t2 = await c.say(SKIP);
    expect(t2.reply).toContain("Okay, I'll use Delhi as a whole.");
    expect(t2.reply).not.toContain('Air in');
    expect(t2.reply).toMatch(/family/);
    expect(t2.chips).toEqual(['No one sensitive', 'Child at home', 'Elder with asthma']);

    const t3 = await c.say('Elder with asthma');
    expect(t3.reply).toMatch(/noted/i);
    expect(t3.reply).toContain('an elder with asthma');
    expect(t3.reply).not.toContain('Air in');
    expect(t3.reply).toMatch(/travel|get around/);
    expect(t3.chips).toEqual(['Car', 'Metro', 'Bus', 'Two-wheeler']);

    const t4 = await c.say('Car');
    expect(t4.reply).toMatch(/^(Okay|Got it), petrol car\./);
    expect(t4.reply).not.toContain('Air in');
    expect(t4.reply).toMatch(/outside/);
    expect(t4.chips).toContain('Nothing outdoors');

    const t5 = await c.say('Nothing outdoors');
    expect(t5.reply).toContain('Your plan for today is ready');
    expect(t5.chips).toEqual([
      'What if I work from home?',
      'Can my child play outside at 5?',
      'Explain the AQI',
    ]);

    const t6 = await c.say('What if I work from home?');
    expect(t6.reply).toContain('CO₂');
    expect(t6.plan?.lowEmissionRoutine).toEqual([]);
    expect(t6.chips).toEqual(t5.chips);
    expect(t6.profile.activities.some((a) => a.kind === 'commute')).toBe(true);
  });

  it('counts an outdoor activity as the third slot and keeps the mode on the commute only', async () => {
    const c = chat();
    await c.say('Delhi');
    await c.say(SKIP);
    await c.say('No one sensitive');
    await c.say('Metro');
    const t = await c.say('Evening stroll');
    expect(t.profile.activities.map((a) => a.kind)).toEqual(['commute', 'walk']);
    expect(t.profile.activities[0]?.mode).toBe('metro');
    expect(t.profile.activities[1]?.mode).toBeUndefined();
    expect(t.reply).toContain('Your plan for today is ready');
  });

  it('repeats the air line when the reading changes', async () => {
    const c = chat();
    await c.say('Delhi');
    await c.say(SKIP);
    expect((await c.say('No one sensitive')).reply).not.toContain('Air in');
    c.setAir({ ...baseAir, aqi: 230, band: 'poor' });
    const t = await c.say('Metro');
    expect(t.reply).toContain('Air in Delhi is Poor, AQI 230');
  });

  it('varies phrasing deterministically with the turn count', async () => {
    const a = chat();
    const b = chat();
    expect((await a.say('Delhi')).reply).toBe((await b.say('Delhi')).reply);
    await a.say(SKIP);
    expect((await a.say('Child at home')).reply).toMatch(/^Thanks, I have noted a child\./);
    expect((await a.say('Elder with asthma')).reply).toMatch(
      /^Thanks, I have noted an elder with asthma\./,
    );
  });

  it('gives a Devanagari conversational turn', async () => {
    const turn = await chat().say('Delhi', 'hi');
    expect(turn.reply).toMatch(/[ऀ-ॿ]/);
    expect(turn.reply).toContain('177');
    expect(turn.reply).toContain('Open-Meteo');
    expect(turn.chips[0]).toBe(t('chip.skipArea', {}, 'hi'));
  });

  it('never states a number outside the turn data', async () => {
    const c = chat();
    const turns = [
      await c.say('Delhi'),
      await c.say(SKIP),
      await c.say('Child at home'),
      await c.say('Bus'),
      await c.say('Playing outdoors'),
      await c.say('Explain the AQI'),
    ];
    for (const turn of turns) {
      // Code-written text: only the set check applies. 0 and AQI_MAX are engine scale constants, and the
      // sentence-level AQI attribution check is for model text (these replies say "12 min ago" next to the AQI).
      const extra = [minutesSince(baseAir.observedAt, now), 17, 5, 0, AQI_MAX];
      const g = guardReply(turn.reply, allowedNumbers(turn, extra));
      expect(g.guarded, turn.reply).toBe(false);
    }
  });
});
