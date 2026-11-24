import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Assistant } from './chat/useConversation';
import { buildDayPlan } from './engine/planner';
import type { AirReading, Profile } from './types';
import { useLang } from './i18n/i18n';

afterEach(() => {
  localStorage.clear();
  // The language lives in module state, so reset it through the hook, not just the attribute.
  const { result } = renderHook(() => useLang());
  act(() => result.current.setLang('en'));
});

describe('App shell', () => {
  it('shows the app name as the page heading', () => {
    render(<App assistant={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Saans', level: 1 })).toBeInTheDocument();
  });

  it('has header, main and footer landmarks', () => {
    render(<App assistant={vi.fn()} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers a skip link to main content', () => {
    render(<App assistant={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('shows the air attribution and the not-medical-advice note in the footer', () => {
    render(<App assistant={vi.fn()} />);
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByText('Air data: CAMS via Open-Meteo (modelled)'),
    ).toBeInTheDocument();
    expect(within(footer).getByText(/Not medical advice/)).toBeInTheDocument();
  });

  it('starts idle: welcome message and an empty air card, no sample data', () => {
    render(<App assistant={vi.fn()} />);
    expect(within(screen.getByRole('log')).getByText(/Tell me your city/)).toBeInTheDocument();
    expect(screen.getByText('Enter a place to see its air quality.')).toBeInTheDocument();
    expect(screen.queryByText(/Sample plan/)).not.toBeInTheDocument();
  });

  it('shows the welcome in Hindi too', async () => {
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'हिंदी' }));
    expect(within(screen.getByRole('log')).getByText(/अपना शहर/)).toBeInTheDocument();
  });

  it('sends a message, shows the reply in the log, the live reading and the plan', async () => {
    const user = userEvent.setup();
    const profile: Profile = {
      location: { city: 'Delhi', lat: 28.61, lon: 77.21 },
      household: [{ group: 'adult', respiratory: false, pregnant: false }],
      activities: [],
    };
    const air: AirReading = {
      aqi: 223,
      band: 'poor',
      pm25: 150,
      pm10: 210,
      dominantPollutant: 'pm25',
      source: 'CAMS via Open-Meteo',
      stationOrGrid: 'x',
      observedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      isModelled: true,
      isStale: false,
    };
    const assistant = vi.fn<Assistant>().mockResolvedValue({
      reply: 'Air in Delhi is Poor, AQI 223.',
      chips: ['Car'],
      profile,
      air,
      forecast: null,
      plan: buildDayPlan({ profile, air, forecast: null, now: '2026-11-22T08:00' }),
      candidates: [],
      degraded: true,
      guarded: false,
    });
    render(<App assistant={assistant} />);
    await user.type(screen.getByLabelText('Your message'), 'Delhi{Enter}');
    expect(await within(screen.getByRole('log')).findByText(/AQI 223/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Air in Delhi' })).toHaveTextContent('223');
    expect(await screen.findByRole('heading', { name: 'Your day plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Car' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toHaveFocus();
  });

  it('keeps the reading and plan on screen while the user picks a place', async () => {
    const user = userEvent.setup();
    const profile: Profile = {
      location: { city: 'Delhi', lat: 28.61, lon: 77.21 },
      household: [{ group: 'adult', respiratory: false, pregnant: false }],
      activities: [],
    };
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
    const base = {
      chips: [],
      profile,
      forecast: null,
      candidates: [],
      degraded: true,
      guarded: false,
    };
    const assistant = vi
      .fn<Assistant>()
      .mockResolvedValueOnce({
        ...base,
        reply: 'ok',
        air,
        plan: buildDayPlan({ profile, air, forecast: null, now: '2026-11-22T08:00' }),
      })
      .mockResolvedValue({ ...base, reply: 'Which one?', air: null, plan: null });
    render(<App assistant={assistant} />);
    await user.type(screen.getByLabelText('Your message'), 'Delhi{Enter}');
    await screen.findByRole('heading', { name: 'Your day plan' });
    await user.type(screen.getByLabelText('Your message'), 'Aurangabad{Enter}');
    await within(screen.getByRole('log')).findByText(/Which one/);
    expect(screen.getByRole('region', { name: 'Air in Delhi' })).toHaveTextContent('223');
    expect(screen.getByRole('heading', { name: 'Your day plan' })).toBeInTheDocument();
  });

  it('marks each language button with its own lang attribute', () => {
    render(<App assistant={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: 'हिंदी' })).toHaveAttribute('lang', 'hi');
  });

  it('language toggle switches the page language and the html lang attribute', async () => {
    const user = userEvent.setup();
    render(<App assistant={vi.fn()} />);
    const english = screen.getByRole('button', { name: 'English' });
    const hindi = screen.getByRole('button', { name: 'हिंदी' });
    expect(english).toHaveAttribute('aria-pressed', 'true');
    expect(hindi).toHaveAttribute('aria-pressed', 'false');

    await user.click(hindi);
    expect(document.documentElement.lang).toBe('hi');
    expect(hindi).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'साँस', level: 1 })).toBeInTheDocument();

    await user.click(english);
    expect(document.documentElement.lang).toBe('en');
  });

  describe('AI key', () => {
    beforeAll(() => {
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    });
    afterEach(() => sessionStorage.clear());

    it('shows AI: off, opens the key dialog, saves a key, and returns focus to the button', async () => {
      const user = userEvent.setup();
      render(<App assistant={vi.fn()} />);
      const button = screen.getByRole('button', { name: 'AI: off' });
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      await user.click(button);
      await user.type(screen.getByLabelText('Your Gemini API key'), 'AIza-0123456789-abcdefghij');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('button', { name: 'AI: on' })).toHaveFocus();
      expect(sessionStorage.getItem('saans.geminiKey')).toBe('AIza-0123456789-abcdefghij');
    });

    it('starts as AI: on when a key is already stored', () => {
      sessionStorage.setItem('saans.geminiKey', 'AIza-0123456789-abcdefghij');
      render(<App assistant={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'AI: on' })).toBeInTheDocument();
    });

    it('shows a friendly notice when the assistant reports one', async () => {
      const user = userEvent.setup();
      const assistant: Assistant = () =>
        Promise.resolve({
          reply: 'Which city?',
          chips: [],
          profile: { household: [], activities: [] },
          air: null,
          forecast: null,
          plan: null,
          candidates: [],
          degraded: true,
          guarded: false,
          notice: 'quota',
        });
      render(<App assistant={assistant} />);
      await user.type(screen.getByLabelText('Your message'), 'hi{Enter}');
      expect(await screen.findByText(/usage limit/)).toBeInTheDocument();
    });
  });
});
