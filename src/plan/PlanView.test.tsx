import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Activity, DayPlan } from '../types';
import PlanView from './PlanView';

const activities: Activity[] = [{ kind: 'walk', participants: [0], flexible: true }];

const plan: DayPlan = {
  lowEmissionRoutine: [
    {
      period: 'morning',
      items: [
        {
          activityIndex: 0,
          startHour: 8,
          adviceKey: 'goAhead',
          reasonKey: 'reason.goAhead',
          params: { band: 'good' },
        },
      ],
    },
  ],
  sustainableSwaps: [
    {
      activityIndex: 0,
      fromMode: 'twoWheeler',
      toMode: 'cycle',
      impact: { exposureSavedUg: 10, exposureSavedPct: 12, co2SavedKg: 0.4 },
      whyKey: 'swap.cycle',
    },
  ],
  indoorAirTips: [{ key: 'exhaustCooking', params: {} }],
  sensitive: true,
};

describe('PlanView', () => {
  it('shows the plan title, sections and the sensitive-household note', () => {
    render(<PlanView plan={plan} activities={activities} />);
    expect(screen.getByRole('heading', { name: 'Your day plan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Low-emission routine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sustainable swaps' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Indoor air at home' })).toBeInTheDocument();
    expect(screen.getByText(/is sensitive to smog/)).toBeInTheDocument();
    expect(screen.getByText(/^Cycling instead of two-wheeler/)).toBeInTheDocument();
    // The walk label shows on the timeline item and on the swap card that uses the same activity.
    expect(screen.getAllByText('Walk')).toHaveLength(2);
  });

  it('hides the sensitive note when no one is sensitive', () => {
    render(<PlanView plan={{ ...plan, sensitive: false }} activities={activities} />);
    expect(screen.queryByText(/is sensitive to smog/)).not.toBeInTheDocument();
  });

  it('says so when there are no swaps', () => {
    render(<PlanView plan={{ ...plan, sustainableSwaps: [] }} activities={activities} />);
    expect(screen.getByText('No swaps to suggest today.')).toBeInTheDocument();
  });
});
