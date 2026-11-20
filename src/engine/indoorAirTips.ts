import type { AirReading, Forecast, Tip } from '../types';
import { bandAtLeast } from './aqi';
import { NO_INCENSE_FROM_BAND, PURIFIER_FROM_BAND } from './constants';
import { bestWindow, worstWindow } from './forecast';

export function indoorAirTips(input: {
  air: AirReading;
  forecast: Forecast | null;
  day: string;
  sensitive: boolean;
}): Tip[] {
  const { air, forecast, day, sensitive } = input;
  const hours = forecast?.hours ?? [];
  const best = bestWindow(hours, { fromHour: 10, toHour: 18, lengthH: 2, day });
  const worst = worstWindow(hours, { fromHour: 6, toHour: 21, lengthH: 3, day });
  const tips: Tip[] = [];

  if (best) tips.push({ key: 'airOut', params: { from: best.startHour, to: best.startHour + 2 } });
  else tips.push({ key: 'airOutUnavailable', params: {} });
  if (worst) {
    tips.push({ key: 'windowsShut', params: { from: worst.startHour, to: worst.startHour + 3 } });
  }
  if (sensitive || bandAtLeast(air.band, PURIFIER_FROM_BAND)) {
    tips.push({ key: 'purifierNight', params: { band: air.band } });
  }
  tips.push({ key: 'exhaustCooking', params: {} });
  if (bandAtLeast(air.band, NO_INCENSE_FROM_BAND)) {
    tips.push({ key: 'noIncense', params: { band: air.band } });
  }
  return tips;
}
