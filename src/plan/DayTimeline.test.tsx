import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Activity, PlanBlock } from '../types';
import { DayTimeline } from './DayTimeline';

const activities: Activity[] = [
  { kind: 'commute', participants: [0], flexible: false },
  { kind: 'schoolRun', participants: [1], flexible: false },
];

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
    render(<DayTimeline blocks={blocks} activities={activities} />);
    expect(screen.getByRole('heading', { name: 'Morning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evening' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Afternoon' })).not.toBeInTheDocument();
  });

  it('shows each item advice with its hour and reason', () => {
    render(<DayTimeline blocks={blocks} activities={activities} />);
    expect(screen.getByText('Go out at 8:00')).toBeInTheDocument();
    expect(screen.getByText('The air is expected to be cleaner at that time.')).toBeInTheDocument();
    expect(
      screen.getByText('The air is Poor; heavy outdoor activity adds the most smog to your lungs.'),
    ).toBeInTheDocument();
  });

  it('labels each item by its own activity, so two items at the same hour differ', () => {
    const twoAtEight: PlanBlock[] = [
      {
        period: 'morning',
        items: [
          {
            activityIndex: 0,
            startHour: 8,
            adviceKey: 'mask',
            reasonKey: 'reason.mask',
            params: { band: 'poor' },
          },
          {
            activityIndex: 1,
            startHour: 8,
            adviceKey: 'mask',
            reasonKey: 'reason.mask',
            params: { band: 'poor' },
          },
        ],
      },
    ];
    render(<DayTimeline blocks={twoAtEight} activities={activities} />);
    expect(screen.getByText('Commute')).toBeInTheDocument();
    expect(screen.getByText('School run')).toBeInTheDocument();
  });

  it('labels household-level items as the whole household', () => {
    render(<DayTimeline blocks={blocks} activities={activities} />);
    expect(screen.getByText('Whole household')).toBeInTheDocument();
  });

  it('uses the activity label when the user gave one', () => {
    const named: Activity[] = [{ ...activities[0]!, label: 'Drop at Aarav school' }];
    render(<DayTimeline blocks={blocks} activities={named} />);
    expect(screen.getByText('Drop at Aarav school')).toBeInTheDocument();
  });

  it('says so when there is nothing to schedule', () => {
    render(<DayTimeline blocks={[]} activities={activities} />);
    expect(screen.getByText('Add an activity to see a timed routine.')).toBeInTheDocument();
  });
});
