import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatCurrencyCompact,
  CURRENCY_SYMBOL,
  FREE_SHIPPING_THRESHOLD,
  DEFAULT_SHIPPING_COST,
} from "@/lib/currency";

describe("formatCurrency", () => {
  it("formats basic amount with ₹ symbol", () => {
    expect(formatCurrency(500)).toBe("₹500");
  });

  it("formats with decimals", () => {
    expect(formatCurrency(499.5, { showDecimals: true })).toBe("₹499.50");
  });

  it("formats in thousands compact", () => {
    expect(formatCurrency(5000, { compact: true })).toBe("₹5.0K");
  });

  it("formats in lakhs compact", () => {
    expect(formatCurrency(250000, { compact: true })).toBe("₹2.5L");
  });

  it("uses Indian number system for large numbers", () => {
    const result = formatCurrency(1234567);
    expect(result).toContain("₹");
    // Indian format: 12,34,567
    expect(result).toContain("12,34,567");
  });
});

describe("formatCurrencyCompact", () => {
  it("delegates to formatCurrency with compact", () => {
    expect(formatCurrencyCompact(3000)).toBe("₹3.0K");
  });
});

describe("Constants", () => {
  it("exports correct currency symbol", () => expect(CURRENCY_SYMBOL).toBe("₹"));
  it("free shipping threshold is 2000", () => expect(FREE_SHIPPING_THRESHOLD).toBe(2000));
  it("default shipping is 99", () => expect(DEFAULT_SHIPPING_COST).toBe(99));
});
