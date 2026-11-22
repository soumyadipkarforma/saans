import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Swap } from '../types';
import { SwapCard } from './SwapCard';

const swap: Swap = {
  activityIndex: 0,
  fromMode: 'petrolCar',
  toMode: 'metro',
  impact: { exposureSavedUg: 120, exposureSavedPct: 42.4, co2SavedKg: 1.2 },
  whyKey: 'swap.metro',
};

describe('SwapCard', () => {
  it('shows the headline numbers from the swap impact', () => {
    render(<SwapCard swap={swap} />);
    expect(
      screen.getByText('Metro instead of Petrol car → 42% less smog inhaled · 1.2 kg CO₂ saved'),
    ).toBeInTheDocument();
  });

  it('uses more-smog and less-CO₂ wording when exposure goes up', () => {
    const worse = { exposureSavedUg: -50, exposureSavedPct: -35.2, co2SavedKg: 0.8 };
    render(<SwapCard swap={{ ...swap, impact: worse }} />);
    expect(
      screen.getByText('Metro instead of Petrol car → 35% more smog inhaled, 0.8 kg less CO₂'),
    ).toBeInTheDocument();
  });

  it('labels carpool as a mode', () => {
    render(<SwapCard swap={{ ...swap, toMode: 'carpool' }} />);
    expect(screen.getByText(/^Carpool instead of/)).toBeInTheDocument();
  });

  it('reveals the reason when Why? is pressed and toggles aria-expanded', async () => {
    const user = userEvent.setup();
    render(<SwapCard swap={swap} />);
    const why = screen.getByRole('button', { name: 'Why?' });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Metro trains keep you away/)).not.toBeInTheDocument();

    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Metro trains keep you away/)).toBeInTheDocument();

    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'false');
  });

  it('prefers a free-text why over the keyed reason', async () => {
    const user = userEvent.setup();
    render(<SwapCard swap={{ ...swap, why: 'Your route is 2 km.' }} />);
    await user.click(screen.getByRole('button', { name: 'Why?' }));
    expect(screen.getByText('Your route is 2 km.')).toBeInTheDocument();
  });
});
