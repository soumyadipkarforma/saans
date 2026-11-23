import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AqiCard } from './AqiCard';
import { SwapCard } from './SwapCard';
import type { AirReading, Swap } from '../types';

const air: AirReading = {
  aqi: 312,
  band: 'veryPoor',
  pm25: 180,
  pm10: 260,
  dominantPollutant: 'pm25',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: 'x',
  observedAt: '2026-11-22T02:00:00.000Z',
  fetchedAt: '2026-11-22T02:00:00.000Z',
  isModelled: true,
  isStale: false,
};
const swap: Swap = {
  activityIndex: 0,
  fromMode: 'petrolCar',
  toMode: 'metro',
  whyKey: 'swap.why.cleanerAir',
  impact: { exposureSavedUg: 4.2, exposureSavedPct: 38, co2SavedKg: 1.5 },
};

describe('golden rule: numbers on screen come from the engine and data, never the model text', () => {
  it('shows 312 and 38 even when the reply claims 999 and 90%', () => {
    render(
      <>
        <p>AQI 999, 90% less smog</p>
        <div data-testid="cards">
          <AqiCard air={air} status="ready" now={new Date('2026-11-22T02:10:00Z')} city="Delhi" />
          <SwapCard swap={swap} activity="Commute" />
        </div>
      </>,
    );
    const cards = screen.getByTestId('cards');
    expect(within(cards).getByText('312')).toBeInTheDocument();
    expect(cards.textContent).toContain('38% less smog');
    expect(cards.textContent).not.toMatch(/999|90%/);
  });
});
