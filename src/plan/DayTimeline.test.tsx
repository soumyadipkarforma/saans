import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlanBlock } from '../types';
import { DayTimeline } from './DayTimeline';

const blocks: PlanBlock[] = [
  {
    period: 'morning',
    items: [
      {
        activityIndex: 0,
        startHour: 8,
        adviceKey: 'goAt',
        reasonKey: 'reason.goAt',
        params: { hour: 8 },
      },
    ],
  },
  { period: 'afternoon', items: [] },
  {
    period: 'evening',
    items: [
      {
        activityIndex: null,
        startHour: 17,
        adviceKey: 'moveIndoors',
        reasonKey: 'reason.moveIndoors',
        params: { band: 'poor' },
      },
    ],
  },
];

describe('DayTimeline', () => {
  it('has a heading for each period that has items, and none for empty periods', () => {
    render(<DayTimeline blocks={blocks} />);
    expect(screen.getByRole('heading', { name: 'Morning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evening' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Afternoon' })).not.toBeInTheDocument();
  });

  it('shows each item advice with its hour and reason', () => {
    render(<DayTimeline blocks={blocks} />);
    expect(screen.getByText('Go out at 8:00')).toBeInTheDocument();
    expect(screen.getByText('The air is expected to be cleaner at that time.')).toBeInTheDocument();
    expect(
      screen.getByText('The air is Poor; heavy outdoor activity adds the most smog to your lungs.'),
    ).toBeInTheDocument();
  });

  it('says so when there is nothing to schedule', () => {
    render(<DayTimeline blocks={[]} />);
    expect(screen.getByText('Add an activity to see a timed routine.')).toBeInTheDocument();
  });
});
