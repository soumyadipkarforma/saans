import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { useLang } from './i18n/i18n';

afterEach(() => {
  localStorage.clear();
  // The language lives in module state, so reset it through the hook, not just the attribute.
  const { result } = renderHook(() => useLang());
  act(() => result.current.setLang('en'));
});

describe('App shell', () => {
  it('shows the app name as the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Saans', level: 1 })).toBeInTheDocument();
  });

  it('has header, main and footer landmarks', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers a skip link to main content', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('shows the air attribution and the not-medical-advice note in the footer', () => {
    render(<App />);
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByText('Air data: CAMS via Open-Meteo (modelled)'),
    ).toBeInTheDocument();
    expect(within(footer).getByText(/Not medical advice/)).toBeInTheDocument();
  });

  it('shows the sample air reading in the plan column', () => {
    render(<App />);
    const region = screen.getByRole('region', { name: 'Air in Delhi' });
    expect(within(region).getByText('223')).toBeInTheDocument();
    expect(within(region).getByText('updated 12 min ago')).toBeInTheDocument();
  });

  it('loads the day plan lazily from the sample profile', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Your day plan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Morning' })).toBeInTheDocument();
    expect(screen.getByText('Metro instead of petrol car', { exact: false })).toBeInTheDocument();
  });

  it('marks the plan and reading as sample data', () => {
    render(<App />);
    expect(screen.getByText('Sample plan — not live data')).toBeInTheDocument();
  });

  it('marks the sample note in Hindi too', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'हिंदी' }));
    expect(screen.getByText('नमूना योजना — लाइव डेटा नहीं')).toBeInTheDocument();
  });

  it('marks each language button with its own lang attribute', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: 'हिंदी' })).toHaveAttribute('lang', 'hi');
  });

  it('language toggle switches the page language and the html lang attribute', async () => {
    const user = userEvent.setup();
    render(<App />);
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
});
