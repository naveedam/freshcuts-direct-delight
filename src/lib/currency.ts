/**
 * Currency formatting utility for Indian Rupees (INR)
 */

export const formatCurrency = (amount: number, options?: {
  showDecimals?: boolean;
  compact?: boolean;
}): string => {
  const { showDecimals = false, compact = false } = options || {};
  
  if (compact && amount >= 100000) {
    // Format in lakhs
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(1)}L`;
  }
  
  if (compact && amount >= 1000) {
    // Format in thousands
    const thousands = amount / 1000;
    return `₹${thousands.toFixed(1)}K`;
  }
  
  if (showDecimals) {
    return `₹${amount.toFixed(2)}`;
  }
  
  // Format with Indian number system (lakh, crore separators)
  return `₹${amount.toLocaleString('en-IN', { 
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  })}`;
};

export const formatCurrencyCompact = (amount: number): string => {
  return formatCurrency(amount, { compact: true });
};

export const CURRENCY_SYMBOL = '₹';
export const CURRENCY_CODE = 'INR';
export const FREE_SHIPPING_THRESHOLD = 2000;
export const DEFAULT_SHIPPING_COST = 99;
