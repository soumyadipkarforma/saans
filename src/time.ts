// India has no daylight saving, so a fixed +05:30 offset gives IST wall-clock time.
const IST_OFFSET_MS = 330 * 60_000;

// "YYYY-MM-DDTHH:mm" in IST, the form the planner expects.
export function istNow(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

// Whole minutes since `iso`; a clock behind it reads as 0, not negative.
export function minutesSince(iso: string, now: Date): number {
  const elapsed = (now.getTime() - Date.parse(iso)) / 60_000;
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed)) : 0;
}
