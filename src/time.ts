// India has no daylight saving, so a fixed +05:30 offset gives IST wall-clock time.
const IST_OFFSET_MS = 330 * 60_000;

// "YYYY-MM-DDTHH:mm" in IST, the form the planner expects.
export function istNow(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}
