import type { PricingModel } from '@/types/product';

// Weight utility functions for 500g ordering system

// Base unit is 500g - quantity 1 = 500g
export const WEIGHT_UNIT_GRAMS = 500;

/**
 * Check if a product uses weight-based pricing
 */
export function isWeightBased(pricingModel: PricingModel): boolean {
  return pricingModel === 'weight_based';
}

/**
 * Format quantity for display based on pricing model
 */
export function formatQuantityDisplay(quantity: number, pricingModel: PricingModel): string {
  if (pricingModel === 'unit_based') {
    return `${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
  }
  return formatWeight(quantity);
}

/**
 * Format quantity to display weight (e.g., 1 = "500g", 2 = "1kg", 3 = "1.5kg")
 */
export function formatWeight(quantity: number): string {
  const totalGrams = quantity * WEIGHT_UNIT_GRAMS;
  
  if (totalGrams < 1000) {
    return `${totalGrams}g`;
  }
  
  const kg = totalGrams / 1000;
  if (kg === Math.floor(kg)) {
    return `${kg}kg`;
  }
  return `${kg}kg`;
}

/**
 * Get unit label for price display based on pricing model
 */
export function getPriceUnitLabel(pricingModel: PricingModel = 'weight_based'): string {
  return pricingModel === 'unit_based' ? 'per unit' : 'per kg';
}

/**
 * Get total weight in kg (only meaningful for weight-based)
 */
export function getTotalWeightKg(quantity: number): number {
  return (quantity * WEIGHT_UNIT_GRAMS) / 1000;
}

/**
 * Calculate price based on pricing model
 * - weight_based: price is per kg, quantity is in 500g units
 * - unit_based: price is per unit, quantity is integer count
 */
export function calculatePrice(pricePerUnit: number, quantity: number, pricingModel: PricingModel = 'weight_based'): number {
  if (pricingModel === 'unit_based') {
    return pricePerUnit * quantity;
  }
  const weightInKg = getTotalWeightKg(quantity);
  return pricePerUnit * weightInKg;
}

/**
 * Derive pricing model from unit type string
 */
export function derivePricingModel(unitType: string): PricingModel {
  const weightUnits = ['kg', 'g', 'gram', 'grams', 'kilogram', 'kilograms'];
  return weightUnits.includes(unitType.toLowerCase()) ? 'weight_based' : 'unit_based';
}
