import { describe, it, expect } from "vitest";
import {
  isWeightBased,
  formatQuantityDisplay,
  formatWeight,
  getPriceUnitLabel,
  getTotalWeightKg,
  calculatePrice,
  derivePricingModel,
  WEIGHT_UNIT_GRAMS,
} from "@/lib/weight-utils";

// ─── Constants ──────────────────────────────────────────────────────

describe("WEIGHT_UNIT_GRAMS", () => {
  it("is 500", () => expect(WEIGHT_UNIT_GRAMS).toBe(500));
});

// ─── isWeightBased ──────────────────────────────────────────────────

describe("isWeightBased", () => {
  it("returns true for weight_based", () => expect(isWeightBased("weight_based")).toBe(true));
  it("returns false for unit_based", () => expect(isWeightBased("unit_based")).toBe(false));
});

// ─── formatWeight ───────────────────────────────────────────────────

describe("formatWeight", () => {
  it("formats qty=1 as 500g", () => expect(formatWeight(1)).toBe("500g"));
  it("formats qty=2 as 1kg", () => expect(formatWeight(2)).toBe("1kg"));
  it("formats qty=3 as 1.5kg", () => expect(formatWeight(3)).toBe("1.5kg"));
  it("formats qty=4 as 2kg", () => expect(formatWeight(4)).toBe("2kg"));
});

// ─── formatQuantityDisplay ──────────────────────────────────────────

describe("formatQuantityDisplay", () => {
  it("shows weight for weight_based", () => {
    expect(formatQuantityDisplay(2, "weight_based")).toBe("1kg");
  });
  it("shows units for unit_based singular", () => {
    expect(formatQuantityDisplay(1, "unit_based")).toBe("1 unit");
  });
  it("shows units for unit_based plural", () => {
    expect(formatQuantityDisplay(3, "unit_based")).toBe("3 units");
  });
});

// ─── getPriceUnitLabel ──────────────────────────────────────────────

describe("getPriceUnitLabel", () => {
  it("returns 'per kg' for weight_based", () => expect(getPriceUnitLabel("weight_based")).toBe("per kg"));
  it("returns 'per unit' for unit_based", () => expect(getPriceUnitLabel("unit_based")).toBe("per unit"));
  it("defaults to 'per kg'", () => expect(getPriceUnitLabel()).toBe("per kg"));
});

// ─── getTotalWeightKg ───────────────────────────────────────────────

describe("getTotalWeightKg", () => {
  it("qty=1 → 0.5kg", () => expect(getTotalWeightKg(1)).toBe(0.5));
  it("qty=2 → 1kg", () => expect(getTotalWeightKg(2)).toBe(1));
  it("qty=5 → 2.5kg", () => expect(getTotalWeightKg(5)).toBe(2.5));
});

// ─── calculatePrice ─────────────────────────────────────────────────

describe("calculatePrice", () => {
  describe("weight_based", () => {
    it("qty=1 (500g) at ₹600/kg = ₹300", () => {
      expect(calculatePrice(600, 1, "weight_based")).toBe(300);
    });
    it("qty=2 (1kg) at ₹600/kg = ₹600", () => {
      expect(calculatePrice(600, 2, "weight_based")).toBe(600);
    });
    it("qty=3 (1.5kg) at ₹600/kg = ₹900", () => {
      expect(calculatePrice(600, 3, "weight_based")).toBe(900);
    });
  });

  describe("unit_based", () => {
    it("qty=1 at ₹250/unit = ₹250", () => {
      expect(calculatePrice(250, 1, "unit_based")).toBe(250);
    });
    it("qty=3 at ₹150/unit = ₹450", () => {
      expect(calculatePrice(150, 3, "unit_based")).toBe(450);
    });
  });

  it("defaults to weight_based", () => {
    expect(calculatePrice(600, 2)).toBe(600);
  });
});

// ─── derivePricingModel ─────────────────────────────────────────────

describe("derivePricingModel", () => {
  it.each([
    ["kg", "weight_based"],
    ["g", "weight_based"],
    ["gram", "weight_based"],
    ["grams", "weight_based"],
    ["kilogram", "weight_based"],
    ["kilograms", "weight_based"],
  ] as const)("'%s' → %s", (unit, expected) => {
    expect(derivePricingModel(unit)).toBe(expected);
  });

  it.each([
    ["unit", "unit_based"],
    ["pack", "unit_based"],
    ["bottle", "unit_based"],
    ["jar", "unit_based"],
    ["can", "unit_based"],
    ["box", "unit_based"],
    ["piece", "unit_based"],
  ] as const)("'%s' → %s", (unit, expected) => {
    expect(derivePricingModel(unit)).toBe(expected);
  });
});

// ─── Cart total integrity (mixed cart) ──────────────────────────────

describe("Mixed cart total integrity", () => {
  it("correctly totals a mixed weight + unit cart", () => {
    const cartItems = [
      { price: 800, quantity: 2, pricingModel: "weight_based" as const }, // 1kg @ 800 = 800
      { price: 250, quantity: 3, pricingModel: "unit_based" as const },   // 3 × 250 = 750
      { price: 600, quantity: 1, pricingModel: "weight_based" as const }, // 0.5kg @ 600 = 300
    ];

    const total = cartItems.reduce(
      (sum, item) => sum + calculatePrice(item.price, item.quantity, item.pricingModel),
      0
    );

    expect(total).toBe(1850);
  });
});
