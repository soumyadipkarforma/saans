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
  it('names the activity and shows the headline numbers from the swap impact', () => {
    render(<SwapCard swap={swap} activity="Commute" />);
    expect(screen.getByText('Commute')).toBeInTheDocument();
    expect(
      screen.getByText('Metro instead of petrol car → 42.4% less smog inhaled · 1.2 kg CO₂ saved'),
    ).toBeInTheDocument();
  });

  it('says more CO₂ when smog falls but CO₂ rises, and never says saved', () => {
    const impact = { exposureSavedUg: 60, exposureSavedPct: 42.4, co2SavedKg: -0.8 };
    render(<SwapCard swap={{ ...swap, impact }} activity="Commute" />);
    expect(
      screen.getByText('Metro instead of petrol car → 42.4% less smog inhaled · 0.8 kg more CO₂'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/CO₂ saved/)).not.toBeInTheDocument();
  });

  it('says more smog when smog rises, whatever CO₂ does', () => {
    const impact = { exposureSavedUg: -50, exposureSavedPct: -35.2, co2SavedKg: 0.8 };
    render(<SwapCard swap={{ ...swap, impact }} activity="Commute" />);
    expect(
      screen.getByText('Metro instead of petrol car → 35.2% more smog inhaled · 0.8 kg CO₂ saved'),
    ).toBeInTheDocument();
  });

  it('says about the same smog when the percentage rounds to zero', () => {
    const impact = { exposureSavedUg: 1, exposureSavedPct: 0.3, co2SavedKg: 1.2 };
    render(<SwapCard swap={{ ...swap, impact }} activity="Commute" />);
    expect(
      screen.getByText(
        'Metro instead of petrol car → about the same smog inhaled · 1.2 kg CO₂ saved',
      ),
    ).toBeInTheDocument();
  });

  it('shows the engine CO₂ value as-is, without re-rounding', () => {
    const impact = { exposureSavedUg: 5, exposureSavedPct: 10, co2SavedKg: 0.07 };
    render(<SwapCard swap={{ ...swap, impact }} activity="Commute" />);
    expect(screen.getByText(/0\.07 kg CO₂ saved$/)).toBeInTheDocument();
  });

  it('labels carpool as a mode', () => {
    render(<SwapCard swap={{ ...swap, toMode: 'carpool' }} activity="Commute" />);
    expect(screen.getByText(/^Carpool instead of/)).toBeInTheDocument();
  });

  it('reveals the reason when Why? is pressed and toggles aria-expanded', async () => {
    const user = userEvent.setup();
    render(<SwapCard swap={swap} activity="Commute" />);
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
    render(<SwapCard swap={{ ...swap, why: 'Your route is 2 km.' }} activity="Commute" />);
    await user.click(screen.getByRole('button', { name: 'Why?' }));
    expect(screen.getByText('Your route is 2 km.')).toBeInTheDocument();
  });
});
