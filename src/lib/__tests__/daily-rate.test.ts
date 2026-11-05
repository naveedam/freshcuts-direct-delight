import { describe, it, expect } from 'vitest';
import { multRowOn, rateOn } from '@/lib/daily-rate';
import { priceFromRate } from '@/lib/live-rate';

const rates = [
  { rate_date: '2026-11-01', rate: 200, source: null },
  { rate_date: '2026-11-04', rate: 210, source: null },
];
const mults = [
  { cut_id: 'curry', effective_date: '2026-10-01', multiplier: 1.4, selling_multiplier: 2 },
  { cut_id: 'curry', effective_date: '2026-11-03', multiplier: 1.5, selling_multiplier: null },
];

describe('rateOn', () => {
  it('carries the latest rate forward', () => {
    expect(rateOn(rates, '2026-11-05')?.rate).toBe(210);
    expect(rateOn(rates, '2026-11-03')?.rate).toBe(200);
    expect(rateOn(rates, '2026-10-31')).toBeNull();
  });
});

describe('multRowOn', () => {
  it('uses the set in force on the day, as a full snapshot', () => {
    expect(multRowOn(mults, 'curry', '2026-11-02')?.selling_multiplier).toBe(2);
    // The newer set has no selling multiplier: it does not fall back to the older one.
    expect(multRowOn(mults, 'curry', '2026-11-05')?.selling_multiplier).toBeNull();
    expect(multRowOn(mults, 'curry', '2026-11-05')?.multiplier).toBe(1.5);
  });
  it('website price is rate × selling multiplier, rounded half up', () => {
    expect(priceFromRate(210, 2)).toBe(420);
    expect(priceFromRate(143, 1.5)).toBe(215);
  });
});
