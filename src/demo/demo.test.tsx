import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { buildDayPlan } from '../engine/planner';
import { useLang } from '../i18n/i18n';
import { createDegradedAssistant } from '../llm/degradedAssistant';
import type { AirReading, Location } from '../types';
import { DEMO_FAMILIES } from './families';

const stamp = new Date().toISOString();
const air: AirReading = {
  aqi: 223,
  band: 'poor',
  pm25: 150,
  pm10: 210,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: stamp,
  fetchedAt: stamp,
  isModelled: true,
  isStale: false,
};
const noForecast = { hours: [], source: air.source, fetchedAt: stamp };
const place = (city: string, state: string, lat: number, lon: number): Location => ({
  city,
  state,
  lat,
  lon,
});
const PLACES: Record<string, Location[]> = {
  Delhi: [
    place('Delhi', 'National Capital Territory of Delhi', 28.65, 77.23),
    place('Delhi', 'Delhi', 28.7, 77.1),
  ],
  Mumbai: [place('Mumbai', 'Maharashtra', 19.07, 72.88)],
  Kolkata: [place('Kolkata', 'West Bengal', 22.57, 88.36)],
};

function fakeAssistant() {
  return createDegradedAssistant({
    geocode: (q) => Promise.resolve(PLACES[q] ?? []),
    air: { getAir: () => Promise.resolve({ air, forecast: noForecast }) },
  });
}

const geo = (value: unknown) =>
  Object.defineProperty(navigator, 'geolocation', { value, configurable: true });

beforeEach(() => {
  // Reduced motion makes the demo script play instantly.
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: true }),
    configurable: true,
  });
});

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(navigator, 'geolocation');
  const { result } = renderHook(() => useLang());
  act(() => result.current.setLang('en'));
});

describe('demo families', () => {
  it('match the spec', () => {
    const [sharma, iyer, das] = DEMO_FAMILIES;
    expect(DEMO_FAMILIES.map((f) => [f.id, f.city])).toEqual([
      ['sharma', 'Delhi'],
      ['iyer', 'Mumbai'],
      ['das', 'Kolkata'],
    ]);
    expect(sharma?.profile.household.map((m) => m.group)).toEqual([
      'adult',
      'adult',
      'child',
      'elderly',
    ]);
    expect(sharma?.profile.household[2]?.age).toBe(8);
    expect(sharma?.profile.household[3]?.respiratory).toBe(true);
    expect(
      sharma?.profile.activities.map((a) => [a.kind, a.mode, a.startHour, a.distanceKm]),
    ).toEqual([
      ['schoolRun', 'petrolCar', 8, undefined],
      ['commute', 'petrolCar', 9, 12],
    ]);
    expect(iyer?.profile.household).toHaveLength(2);
    expect(iyer?.profile.activities.map((a) => [a.kind, a.mode, a.distanceKm, a.flexible])).toEqual(
      [
        ['commute', 'twoWheeler', 10, false],
        ['exercise', undefined, undefined, true],
      ],
    );
    expect(das?.profile.household.map((m) => m.group)).toEqual(['elderly', 'elderly']);
    expect(das?.profile.activities.map((a) => [a.kind, a.mode, a.distanceKm, a.flexible])).toEqual([
      ['walk', undefined, undefined, true],
      ['errand', 'bus', 3, false],
    ]);
    DEMO_FAMILIES.forEach((f) => f.script.forEach((line) => expect(line).toContain('?')));
  });

  it('gives Sharma and Iyer different plans on the same air', () => {
    const plans = DEMO_FAMILIES.slice(0, 2).map((f) =>
      buildDayPlan({
        profile: { ...f.profile, location: PLACES[f.city]?.[0] },
        air,
        forecast: null,
        now: '2026-11-22T07:00',
      }),
    );
    expect(plans[0]?.sensitive).toBe(true);
    expect(plans[1]?.sensitive).toBe(false);
    expect(plans[0]?.sustainableSwaps.length).toBeGreaterThan(0);
    expect(plans[0]?.sustainableSwaps.map((s) => s.fromMode)).toContain('petrolCar');
    expect(plans[1]?.sustainableSwaps.map((s) => s.fromMode)).not.toContain('petrolCar');
  });
});

describe('demo in the app (no key, live-shaped data)', () => {
  it('Sharma: resolves Delhi, sets the profile and ends on the AQI card with a swap', async () => {
    const user = userEvent.setup();
    render(<App assistant={fakeAssistant()} />);
    await user.click(screen.getByRole('button', { name: 'Sharma family, Delhi' }));
    const log = screen.getByRole('log');
    await within(log).findByText(/Which swap would help us the most/, {}, { timeout: 5000 });
    await waitFor(() => expect(screen.queryByText(/Playing the demo/)).not.toBeInTheDocument());
    const card = screen.getByRole('region', { name: 'Air in Delhi' });
    expect(card).toHaveTextContent('223');
    expect(card).toHaveTextContent('CAMS via Open-Meteo');
    expect(within(log).getByText('Delhi, National Capital Territory of Delhi')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sustainable swaps' })).toBeInTheDocument();
    expect(screen.queryByText('No swaps to suggest today.')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('saans.profile') ?? '{}')).toMatchObject({
      location: { state: 'National Capital Territory of Delhi' },
      household: expect.arrayContaining([expect.objectContaining({ age: 8 })]) as unknown,
    });
  });
});

describe('Try saying', () => {
  it('lists six sentences and a click fills the box without sending', async () => {
    const user = userEvent.setup();
    const assistant = vi.fn();
    render(<App assistant={assistant} />);
    const group = screen.getByRole('region', { name: 'Try saying…' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    await user.click(
      within(group).getByRole('button', {
        name: 'I live in Pune, I cycle to college and my dad has asthma',
      }),
    );
    const input = screen.getByLabelText('Your message');
    expect(input).toHaveValue('I live in Pune, I cycle to college and my dad has asthma');
    expect(input).toHaveFocus();
    expect(assistant).not.toHaveBeenCalled();
  });

  it('shows the Hindi sentences', async () => {
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'हिंदी' }));
    const group = screen.getByRole('region', { name: 'ऐसे बोलकर देखें…' });
    await user.click(
      within(group).getByRole('button', {
        name: 'मैं लखनऊ में रहता हूँ, सुबह पार्क में टहलता हूँ',
      }),
    );
    expect(screen.getByLabelText('आपका संदेश')).toHaveValue('मैं लखनऊ में रहता हूँ, सुबह पार्क में टहलता हूँ');
  });
});

describe('Use my location', () => {
  const at = (latitude: number, longitude: number) =>
    geo({
      getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude, longitude } }),
    });

  it('labels the place "Your location" and shows the air there', async () => {
    at(28.6, 77.2);
    const user = userEvent.setup();
    render(<App assistant={fakeAssistant()} />);
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(
      await screen.findByRole('region', { name: 'Air in Your location' }, { timeout: 5000 }),
    ).toHaveTextContent('223');
  });

  it('rejects coordinates outside India with a message and sends nothing', async () => {
    at(51.5, -0.12);
    const user = userEvent.setup();
    const assistant = vi.fn();
    render(<App assistant={assistant} />);
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/outside India/)).toBeInTheDocument();
    expect(assistant).not.toHaveBeenCalled();
  });

  it('handles denial and a browser with no geolocation', async () => {
    geo({ getCurrentPosition: (_ok: unknown, fail: () => void) => fail() });
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/Location access was blocked/)).toBeInTheDocument();

    Reflect.deleteProperty(navigator, 'geolocation');
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/cannot share your location/)).toBeInTheDocument();
  });
});
