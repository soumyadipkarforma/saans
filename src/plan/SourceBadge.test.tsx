import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AirReading } from '../types';
import { SourceBadge } from './SourceBadge';

const FETCHED_AT = '2026-11-22T08:00:00+05:30';

const air: AirReading = {
  aqi: 120,
  band: 'satisfactory',
  pm25: 60,
  pm10: 90,
  dominantPollutant: 'pm10',
  source: 'CAMS via Open-Meteo',
  stationOrGrid: '28.61,77.21',
  observedAt: FETCHED_AT,
  fetchedAt: FETCHED_AT,
  isModelled: true,
  isStale: false,
};

const at = (minutes: number) => new Date(Date.parse(FETCHED_AT) + minutes * 60_000);

describe('SourceBadge', () => {
  it('names the source and marks the reading as a modelled estimate', () => {
    render(<SourceBadge air={air} now={at(0)} />);
    expect(screen.getByText('CAMS via Open-Meteo')).toBeInTheDocument();
    expect(screen.getByText('modelled estimate')).toBeInTheDocument();
  });

  it('shows the age in whole minutes', () => {
    render(<SourceBadge air={air} now={at(12.9)} />);
    expect(screen.getByText('updated 12 min ago')).toBeInTheDocument();
  });

  it('says just now for a reading under a minute old', () => {
    render(<SourceBadge air={air} now={at(0.5)} />);
    expect(screen.getByText('updated just now')).toBeInTheDocument();
  });

  it('never shows a negative age when the clock is behind', () => {
    render(<SourceBadge air={air} now={at(-5)} />);
    expect(screen.getByText('updated just now')).toBeInTheDocument();
  });

  it('shows stale only for stale readings', () => {
    const { rerender } = render(<SourceBadge air={air} now={at(0)} />);
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
    rerender(<SourceBadge air={{ ...air, isStale: true }} now={at(0)} />);
    expect(screen.getByText('stale')).toBeInTheDocument();
  });
});
