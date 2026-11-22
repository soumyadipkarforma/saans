import { expect, it } from 'vitest';
import { istNow } from './time';

it('converts UTC to IST wall-clock time', () => {
  expect(istNow(new Date('2026-11-22T02:30:00Z'))).toBe('2026-11-22T08:00');
});

it('rolls over to the next IST day', () => {
  expect(istNow(new Date('2026-11-22T19:00:00Z'))).toBe('2026-11-23T00:30');
});
