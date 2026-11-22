import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AirReading } from '../types';
import { AqiCard } from './AqiCard';

const FETCHED_AT = '2026-11-22T08:00:00+05:30';

function makeAir(overrides: Partial<AirReading> = {}): AirReading {
  return {
    aqi: 280,
    band: 'poor',
    pm25: 150,
    pm10: 210,
    dominantPollutant: 'pm25',
    source: 'CAMS via Open-Meteo',
    stationOrGrid: '28.61,77.21',
    observedAt: '2026-11-22T08:00:00+05:30',
    fetchedAt: FETCHED_AT,
    isModelled: true,
    isStale: false,
    ...overrides,
  };
}

const NOW = new Date('2026-11-22T02:30:00Z');
const LATER = new Date(Date.parse(FETCHED_AT) + 12 * 60_000);

describe('AqiCard', () => {
  it('shows the AQI number, the band label and the dominant pollutant', () => {
    render(<AqiCard air={makeAir()} status="ready" now={LATER} />);
    expect(screen.getByText('280')).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.getByText('Dominant pollutant: PM2.5')).toBeInTheDocument();
  });

  it('carries the band in text, not only in colour', () => {
    render(<AqiCard air={makeAir({ band: 'severe', aqi: 450 })} status="ready" now={LATER} />);
    const chip = screen.getByText('Severe');
    expect(chip).toHaveAttribute('data-band', 'severe');
    expect(chip).toHaveTextContent(/^Severe$/);
  });

  it('shows the source, modelled label and age of the reading', () => {
    render(<AqiCard air={makeAir()} status="ready" now={LATER} />);
    expect(screen.getByText('CAMS via Open-Meteo')).toBeInTheDocument();
    expect(screen.getByText('modelled estimate')).toBeInTheDocument();
    expect(screen.getByText('updated 12 min ago')).toBeInTheDocument();
  });

  it('marks a stale reading as stale', () => {
    render(<AqiCard air={makeAir({ isStale: true })} status="ready" now={LATER} />);
    expect(screen.getByText('stale')).toBeInTheDocument();
  });

  it('names the city in the heading when one is given', () => {
    render(<AqiCard air={makeAir()} status="ready" now={LATER} city="Delhi" />);
    expect(screen.getByRole('heading', { name: 'Air in Delhi' })).toBeInTheDocument();
  });

  it('shows a message and no number when unavailable', () => {
    render(<AqiCard air={null} status="unavailable" now={NOW} />);
    expect(screen.getByText(/Air data is unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText('280')).not.toBeInTheDocument();
  });

  it('treats a ready status without a reading as unavailable', () => {
    render(<AqiCard air={null} status="ready" now={NOW} />);
    expect(screen.getByText(/Air data is unavailable right now/)).toBeInTheDocument();
  });

  it('shows a loading message while fetching', () => {
    render(<AqiCard air={null} status="loading" now={NOW} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading air data');
  });

  it('asks for a place while idle', () => {
    render(<AqiCard air={null} status="idle" now={NOW} />);
    expect(screen.getByText(/Enter a place/)).toBeInTheDocument();
  });

  it('keeps the card inside a labelled section', () => {
    render(<AqiCard air={makeAir()} status="ready" now={LATER} />);
    const section = screen.getByRole('region', { name: 'Air right now' });
    expect(within(section).getByText('280')).toBeInTheDocument();
  });
});
