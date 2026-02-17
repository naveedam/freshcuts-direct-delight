import { describe, it, expect } from "vitest";
import {
  calculateLineItemGST,
  buildGSTLineItem,
  buildHSNSummary,
  calculateGSTSummary,
  formatINR,
  getGSTTypeLabel,
  getGSTTypeClass,
  isInterState,
  getStateCodeFromGSTIN,
} from "@/lib/gst-utils";
import type { GSTLineItem } from "@/types/gst";

// ─── calculateLineItemGST ───────────────────────────────────────────

describe("calculateLineItemGST", () => {
  it("returns zero tax for exempt items", () => {
    const r = calculateLineItemGST(2, 500, "exempt", 5, false);
    expect(r).toEqual({ taxableValue: 0, cgst: 0, sgst: 0, igst: 0 });
  });

  it("returns zero tax for nil-rated items", () => {
    const r = calculateLineItemGST(3, 200, "nil", 0, false);
    expect(r).toEqual({ taxableValue: 0, cgst: 0, sgst: 0, igst: 0 });
  });

  it("returns zero tax when gstRate is 0 even if taxable", () => {
    const r = calculateLineItemGST(1, 1000, "taxable", 0, false);
    expect(r).toEqual({ taxableValue: 0, cgst: 0, sgst: 0, igst: 0 });
  });

  it("splits 50/50 CGST/SGST for intra-state 5%", () => {
    const r = calculateLineItemGST(2, 500, "taxable", 5, false);
    expect(r.taxableValue).toBe(1000);
    expect(r.cgst).toBe(25);
    expect(r.sgst).toBe(25);
    expect(r.igst).toBe(0);
  });

  it("applies full IGST for inter-state 12%", () => {
    const r = calculateLineItemGST(1, 1000, "taxable", 12, true);
    expect(r.taxableValue).toBe(1000);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.igst).toBe(120);
  });

  it("handles 18% GST intra-state", () => {
    const r = calculateLineItemGST(4, 250, "taxable", 18, false);
    expect(r.taxableValue).toBe(1000);
    expect(r.cgst).toBe(90);
    expect(r.sgst).toBe(90);
    expect(r.igst).toBe(0);
  });

  it("handles 28% GST inter-state", () => {
    const r = calculateLineItemGST(1, 2000, "taxable", 28, true);
    expect(r.igst).toBe(560);
    expect(r.cgst).toBe(0);
  });
});

// ─── buildGSTLineItem ───────────────────────────────────────────────

describe("buildGSTLineItem", () => {
  it("builds a taxable intra-state line item with correct total", () => {
    const item = buildGSTLineItem("Chicken Breast", "0207", 2, 300, "taxable", 5, false);
    expect(item.product_name).toBe("Chicken Breast");
    expect(item.line_value).toBe(600);
    expect(item.taxable_value).toBe(600);
    expect(item.cgst_amount).toBe(15);
    expect(item.sgst_amount).toBe(15);
    expect(item.igst_amount).toBe(0);
    expect(item.total_with_tax).toBe(630);
  });

  it("builds an exempt line item – total equals line value", () => {
    const item = buildGSTLineItem("Fresh Vegetables", "0701", 5, 100, "exempt", 0, false);
    expect(item.taxable_value).toBe(0);
    expect(item.total_with_tax).toBe(500); // line_value + 0 tax
  });

  it("builds an IGST line item", () => {
    const item = buildGSTLineItem("Paneer", "0406", 1, 400, "taxable", 12, true);
    expect(item.igst_amount).toBe(48);
    expect(item.cgst_amount).toBe(0);
    expect(item.total_with_tax).toBe(448);
  });
});

// ─── buildHSNSummary ────────────────────────────────────────────────

describe("buildHSNSummary", () => {
  it("excludes exempt items from HSN summary", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Veg", "0701", 2, 100, "exempt", 0, false),
    ];
    const summary = buildHSNSummary(items, false);
    expect(summary).toHaveLength(0);
  });

  it("aggregates same HSN code items", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Chicken A", "0207", 2, 300, "taxable", 5, false),
      buildGSTLineItem("Chicken B", "0207", 3, 200, "taxable", 5, false),
    ];
    const summary = buildHSNSummary(items, false);
    expect(summary).toHaveLength(1);
    expect(summary[0].hsn_code).toBe("0207");
    expect(summary[0].quantity).toBe(5);
    expect(summary[0].taxable_value).toBe(1200);
    expect(summary[0].cgst_rate).toBe(2.5);
    expect(summary[0].sgst_rate).toBe(2.5);
  });

  it("separates different HSN codes", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Chicken", "0207", 1, 500, "taxable", 5, false),
      buildGSTLineItem("Fish", "0302", 1, 800, "taxable", 5, false),
    ];
    const summary = buildHSNSummary(items, false);
    expect(summary).toHaveLength(2);
  });

  it("sets IGST rates when inter-state", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Paneer", "0406", 1, 400, "taxable", 12, true),
    ];
    const summary = buildHSNSummary(items, true);
    expect(summary[0].igst_rate).toBe(12);
    expect(summary[0].cgst_rate).toBe(0);
  });
});

// ─── calculateGSTSummary ────────────────────────────────────────────

describe("calculateGSTSummary", () => {
  it("calculates mixed cart with exempt + nil + taxable", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Veg", "0701", 2, 100, "exempt", 0, false),
      buildGSTLineItem("Milk", "0401", 1, 60, "nil", 0, false),
      buildGSTLineItem("Chicken", "0207", 2, 500, "taxable", 5, false),
    ];
    const s = calculateGSTSummary(items);
    expect(s.total_exempt_value).toBe(200);
    expect(s.total_nil_rated_value).toBe(60);
    expect(s.total_taxable_value).toBe(1000);
    expect(s.total_cgst).toBe(25);
    expect(s.total_sgst).toBe(25);
    expect(s.total_igst).toBe(0);
    expect(s.total_tax).toBe(50);
    expect(s.grand_total).toBe(1310); // 200 + 60 + 1000 + 50
  });

  it("handles all-exempt cart", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Veg A", "0701", 3, 150, "exempt", 0, false),
      buildGSTLineItem("Veg B", "0701", 2, 200, "exempt", 0, false),
    ];
    const s = calculateGSTSummary(items);
    expect(s.total_tax).toBe(0);
    expect(s.grand_total).toBe(850);
  });

  it("handles multi-rate taxable cart (5% + 12% + 18%)", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Chicken", "0207", 1, 1000, "taxable", 5, false),
      buildGSTLineItem("Paneer", "0406", 1, 500, "taxable", 12, false),
      buildGSTLineItem("Sauce", "2103", 1, 200, "taxable", 18, false),
    ];
    const s = calculateGSTSummary(items);
    expect(s.total_taxable_value).toBe(1700);
    expect(s.total_cgst).toBeCloseTo(25 + 30 + 18, 2);
    expect(s.total_sgst).toBeCloseTo(25 + 30 + 18, 2);
    expect(s.total_tax).toBeCloseTo(146, 2);
    expect(s.grand_total).toBeCloseTo(1846, 2);
  });

  it("handles IGST cart", () => {
    const items: GSTLineItem[] = [
      buildGSTLineItem("Chicken", "0207", 2, 500, "taxable", 5, true),
    ];
    const s = calculateGSTSummary(items);
    expect(s.total_cgst).toBe(0);
    expect(s.total_sgst).toBe(0);
    expect(s.total_igst).toBe(50);
    expect(s.total_tax).toBe(50);
  });
});

// ─── Utility functions ──────────────────────────────────────────────

describe("formatINR", () => {
  it("formats 1000 as ₹1,000.00", () => {
    expect(formatINR(1000)).toContain("1,000");
  });
});

describe("getGSTTypeLabel", () => {
  it("returns Exempt", () => expect(getGSTTypeLabel("exempt", 0)).toBe("Exempt"));
  it("returns NIL (0%)", () => expect(getGSTTypeLabel("nil", 0)).toBe("NIL (0%)"));
  it("returns rate %", () => expect(getGSTTypeLabel("taxable", 5)).toBe("5%"));
});

describe("getGSTTypeClass", () => {
  it("returns yellow for exempt", () => expect(getGSTTypeClass("exempt")).toContain("yellow"));
  it("returns blue for nil", () => expect(getGSTTypeClass("nil")).toContain("blue"));
  it("returns green for taxable", () => expect(getGSTTypeClass("taxable")).toContain("green"));
});

describe("isInterState", () => {
  it("returns true for different state codes", () => expect(isInterState("27", "29")).toBe(true));
  it("returns false for same state", () => expect(isInterState("27", "27")).toBe(false));
  it("returns false if seller state null", () => expect(isInterState(null, "29")).toBe(false));
  it("returns false if buyer state null", () => expect(isInterState("27", null)).toBe(false));
});

describe("getStateCodeFromGSTIN", () => {
  it("extracts 27 from Maharashtra GSTIN", () => expect(getStateCodeFromGSTIN("27AAACR5055K1Z5")).toBe("27"));
  it("returns null for null/empty", () => {
    expect(getStateCodeFromGSTIN(null)).toBeNull();
    expect(getStateCodeFromGSTIN("")).toBeNull();
  });
});
