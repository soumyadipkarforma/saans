import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AtHomeCard } from './AtHomeCard';

describe('AtHomeCard', () => {
  it('lists each tip with its hours', () => {
    render(
      <AtHomeCard
        tips={[
          { key: 'airOut', params: { from: 6, to: 9 } },
          { key: 'windowsShut', params: { from: 9, to: 21 } },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Indoor air at home' })).toBeInTheDocument();
    expect(screen.getByText('Air the house from 6:00 to 9:00.')).toBeInTheDocument();
    expect(screen.getByText('Keep windows shut from 9:00 to 21:00.')).toBeInTheDocument();
  });

  it('translates the band in tips that carry one', () => {
    render(<AtHomeCard tips={[{ key: 'purifierNight', params: { band: 'severe' } }]} />);
    expect(
      screen.getByText('Run an air purifier at night; the air is Severe.'),
    ).toBeInTheDocument();
  });

  it('says so when there are no tips', () => {
    render(<AtHomeCard tips={[]} />);
    expect(screen.getByText('No indoor tips today.')).toBeInTheDocument();
  });
});
