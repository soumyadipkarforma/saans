import { describe, expect, it, vi } from 'vitest';
import { minutesSince } from '../time';
import type { AirReading, AssistantTurn, ChatMessage, Forecast, Location, Profile } from '../types';
import { createDegradedAssistant } from './degradedAssistant';
import { allowedNumbers, guardReply, readings } from './numberGuard';

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
  it('acknowledges, states the air once, asks one missing slot at a time, then offers follow-ups', async () => {
    const c = chat();
    const t1 = await c.say('Delhi');
    expect(t1.reply).toMatch(/^Got it — Delhi\./);
    expect(t1.reply).toContain(
      'Air in Delhi is Moderate, AQI 177 (CAMS via Open-Meteo, modelled estimate, updated 12 min ago).',
    );
    expect(t1.reply).toMatch(/sensitive to smog/);
    expect(t1.chips).toEqual(['No one sensitive', 'Child at home', 'Elder with asthma']);

    const t2 = await c.say('Elder with asthma');
    expect(t2.reply).toContain('Noted');
    expect(t2.reply).toContain('an elder with asthma');
    expect(t2.reply).not.toContain('Air in');
    expect(t2.reply).toMatch(/travel|get around/);
    expect(t2.chips).toEqual(['Car', 'Metro', 'Bus', 'Two-wheeler']);

    const t3 = await c.say('Car');
    expect(t3.reply).toMatch(/^Okay, petrol car\./);
    expect(t3.reply).not.toContain('Air in');
    expect(t3.reply).toMatch(/outdoors/);
    expect(t3.chips).toContain('Nothing outdoors');

    const t4 = await c.say('Nothing outdoors');
    expect(t4.reply).toContain('plan is ready');
    expect(t4.chips).toEqual([
      'What if I work from home?',
      'Can my child play outside at 5?',
      'Explain the AQI',
    ]);

    const t5 = await c.say('What if I work from home?');
    expect(t5.reply).toContain('CO₂');
    expect(t5.plan?.lowEmissionRoutine).toEqual([]);
    expect(t5.chips).toEqual(t4.chips);
    expect(t5.profile.activities.some((a) => a.kind === 'commute')).toBe(true);
  });

  it('counts an outdoor activity as the third slot and keeps the mode on the commute only', async () => {
    const c = chat();
    await c.say('Delhi');
    await c.say('No one sensitive');
    await c.say('Metro');
    const t = await c.say('Evening stroll');
    expect(t.profile.activities.map((a) => a.kind)).toEqual(['commute', 'walk']);
    expect(t.profile.activities[0]?.mode).toBe('metro');
    expect(t.profile.activities[1]?.mode).toBeUndefined();
    expect(t.reply).toContain('plan is ready');
  });

  it('repeats the air line when the reading changes', async () => {
    const c = chat();
    await c.say('Delhi');
    expect((await c.say('No one sensitive')).reply).not.toContain('Air in');
    c.setAir({ ...baseAir, aqi: 230, band: 'poor' });
    const t = await c.say('Metro');
    expect(t.reply).toContain('Air in Delhi is Poor, AQI 230');
  });

  it('varies phrasing deterministically with the turn count', async () => {
    const a = chat();
    const b = chat();
    expect((await a.say('Delhi')).reply).toBe((await b.say('Delhi')).reply);
    expect((await a.say('Child at home')).reply).toMatch(/^Noted: a child\./);
    expect((await a.say('Elder with asthma')).reply).toMatch(/^Thanks, I have noted an elder/);
  });

  it('gives a Devanagari conversational turn', async () => {
    const t = await chat().say('Delhi', 'hi');
    expect(t.reply).toMatch(/[ऀ-ॿ]/);
    expect(t.reply).toContain('177');
    expect(t.reply).toContain('Open-Meteo');
    expect(t.chips[0]).toBe('कोई संवेदनशील नहीं');
  });

  it('never states a number outside the turn data', async () => {
    const c = chat();
    const turns = [
      await c.say('Delhi'),
      await c.say('Child at home'),
      await c.say('Bus'),
      await c.say('Playing outdoors'),
      await c.say('Explain the AQI'),
    ];
    for (const turn of turns) {
      const extra = [minutesSince(baseAir.observedAt, now), 17, 5];
      const g = guardReply(turn.reply, allowedNumbers(turn, extra), readings(turn));
      expect(g.guarded, turn.reply).toBe(false);
    }
  });
});
