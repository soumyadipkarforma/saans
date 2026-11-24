import { useEffect, useState } from 'react';
import type { Profile } from '../types';

export type Step =
  | { kind: 'profile'; apply: (p: Profile) => Profile }
  // wait: pause before sending so the viewer can follow along (skipped under reduced motion).
  | { kind: 'say'; text: string; wait?: boolean };

const STEP_DELAY_MS = 1200;

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plays steps one at a time, each after the previous turn has finished, so every message
// is sent with the profile the earlier steps produced.
export function useScript(opts: {
  profile: Profile;
  setProfile: (p: Profile) => void;
  say: (text: string) => void;
  idle: boolean;
}) {
  const { profile, setProfile, say, idle } = opts;
  const [queue, setQueue] = useState<Step[]>([]);
  const step = queue[0];

  useEffect(() => {
    if (!step || !idle) return;
    const wait = step.kind === 'say' && step.wait && !reducedMotion();
    const id = setTimeout(
      () => {
        setQueue((q) => q.slice(1));
        if (step.kind === 'profile') setProfile(step.apply(profile));
        else say(step.text);
      },
      wait ? STEP_DELAY_MS : 0,
    );
    return () => clearTimeout(id);
  }, [step, idle, profile, setProfile, say]);

  return { run: setQueue, running: queue.length > 0 };
}
