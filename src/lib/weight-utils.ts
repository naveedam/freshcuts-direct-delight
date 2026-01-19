// Weight utility functions for 500g ordering system

// Base unit is 500g - quantity 1 = 500g
export const WEIGHT_UNIT_GRAMS = 500;

/**
 * Format quantity to display weight (e.g., 1 = "500g", 2 = "1kg", 3 = "1.5kg")
 */
export function formatWeight(quantity: number): string {
  const totalGrams = quantity * WEIGHT_UNIT_GRAMS;
  
  if (totalGrams < 1000) {
    return `${totalGrams}g`;
  }
  
  const kg = totalGrams / 1000;
  // Show decimal only if needed
  if (kg === Math.floor(kg)) {
    return `${kg}kg`;
  }
  return `${kg}kg`;
}

/**
 * Get unit label for price display
 */
export function getPriceUnitLabel(): string {
  return 'per 500g';
}

/**
 * Calculate total weight in kg for order display
 */
export function getTotalWeightKg(quantity: number): number {
  return (quantity * WEIGHT_UNIT_GRAMS) / 1000;
}
