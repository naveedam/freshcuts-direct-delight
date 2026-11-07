import { describe, it, expect } from 'vitest';
import { availabilityOf, canAddToCart, deliveryPlan } from '@/lib/availability';

// IST is UTC+05:30.
const ist = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMinutes(h * 60 + m - 330);
  return d;
};
const HOURS = { opening: '06:00', closing: '18:00' };

describe('availabilityOf (the storefront switch table)', () => {
  it('in stock and orderable: order', () => expect(availabilityOf({ inStock: true, isOrderable: true })).toBe('order'));
  it('out of stock with pre-order: pre-order', () =>
    expect(availabilityOf({ inStock: false, isOrderable: true, preorderEnabled: true })).toBe('preorder'));
  it('out of stock without pre-order: no ordering', () => {
    const a = availabilityOf({ inStock: false, isOrderable: true, preorderEnabled: false });
    expect(a).toBe('out');
    expect(canAddToCart(a)).toBe(false);
  });
  it('not orderable wins over stock', () =>
    expect(availabilityOf({ inStock: true, isOrderable: false, preorderEnabled: true })).toBe('unavailable'));
});

describe('deliveryPlan', () => {
  it('during hours: delivered today, not a pre-order', () =>
    expect(deliveryPlan(HOURS, false, ist('2026-11-07', '10:00'))).toEqual({ date: '2026-11-07', isPreorder: false, afterHours: false }));
  it('after closing: next day, pre-order', () =>
    expect(deliveryPlan(HOURS, false, ist('2026-11-07', '20:30'))).toEqual({ date: '2026-11-08', isPreorder: true, afterHours: true }));
  it('before opening: today, pre-order', () =>
    expect(deliveryPlan(HOURS, false, ist('2026-11-08', '02:00'))).toEqual({ date: '2026-11-08', isPreorder: true, afterHours: true }));
  it('an out-of-stock pre-order item moves delivery to the next day', () =>
    expect(deliveryPlan(HOURS, true, ist('2026-11-07', '10:00')).date).toBe('2026-11-08'));
});
