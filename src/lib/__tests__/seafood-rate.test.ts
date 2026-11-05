import { describe, it, expect } from 'vitest';
import {
  priceInForce, seafoodPricesVisible, seafoodHiddenMessage, isSeafoodCategory, istHour,
  SEAFOOD_EVENING_MESSAGE, SEAFOOD_MORNING_MESSAGE,
} from '@/lib/seafood-rate';

// IST is UTC+05:30, so 18:00 IST = 12:30 UTC.
const ist = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const utcMinutes = h * 60 + m - 330;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMinutes(utcMinutes);
  return d;
};

const selling = [
  { product_id: 'pomfret', effective_date: '2026-11-01', price: 900 },
  { product_id: 'pomfret', effective_date: '2026-11-04', price: 950 },
  { product_id: 'prawns', effective_date: '2026-11-03', price: 600 },
];
const buying = [
  { product_id: 'pomfret', vendor_id: 'v1', effective_date: '2026-11-01', price: 700 },
  { product_id: 'pomfret', vendor_id: 'v2', effective_date: '2026-11-05', price: 720 },
];

describe('priceInForce', () => {
  it('carries the last price forward when nothing was entered today', () => {
    expect(priceInForce(selling, 'pomfret', '2026-11-05')).toEqual({ price: 950, effective_date: '2026-11-04' });
  });
  it('uses the older price for days before a change', () => {
    expect(priceInForce(selling, 'pomfret', '2026-11-03')?.price).toBe(900);
  });
  it('returns null before the first price', () => {
    expect(priceInForce(selling, 'prawns', '2026-11-02')).toBeNull();
  });
  it('matches buying prices by supplier', () => {
    expect(priceInForce(buying, 'pomfret', '2026-11-05', 'v1')?.price).toBe(700);
    expect(priceInForce(buying, 'pomfret', '2026-11-05', 'v2')?.price).toBe(720);
    expect(priceInForce(buying, 'pomfret', '2026-11-04', 'v2')).toBeNull();
  });
});

describe('storefront window', () => {
  it('reads the hour in IST', () => {
    expect(istHour(ist('2026-11-05', '08:30'))).toBe(8);
    expect(istHour(ist('2026-11-05', '23:59'))).toBe(23);
  });
  it('shows prices only when published and before 6 PM IST', () => {
    expect(seafoodPricesVisible(true, ist('2026-11-05', '08:35'))).toBe(true);
    expect(seafoodPricesVisible(true, ist('2026-11-05', '17:59'))).toBe(true);
    expect(seafoodPricesVisible(true, ist('2026-11-05', '18:00'))).toBe(false);
    expect(seafoodPricesVisible(false, ist('2026-11-05', '10:00'))).toBe(false);
  });
  it('says tomorrow after 6 PM and this morning after midnight', () => {
    expect(seafoodHiddenMessage(ist('2026-11-05', '18:00'))).toBe(SEAFOOD_EVENING_MESSAGE);
    expect(seafoodHiddenMessage(ist('2026-11-05', '22:00'))).toBe(SEAFOOD_EVENING_MESSAGE);
    expect(seafoodHiddenMessage(ist('2026-11-06', '01:00'))).toBe(SEAFOOD_MORNING_MESSAGE);
    expect(SEAFOOD_EVENING_MESSAGE).toBe('Prices will be updated tomorrow morning at around 8:30 AM');
  });
});

describe('isSeafoodCategory', () => {
  it('accepts the category name or slug', () => {
    expect(isSeafoodCategory('Seafood & Fish')).toBe(true);
    expect(isSeafoodCategory('seafood')).toBe(true);
    expect(isSeafoodCategory('poultry')).toBe(false);
    expect(isSeafoodCategory(null)).toBe(false);
  });
});
