export interface DiscountResult {
  discountAmount: number;
  finalAmount: number;
}

/**
 * Calculates the discount on an order.
 *
 * Rounding policy:
 * - Money is converted to whole cents (or paise) first, so the arithmetic is done with integers
 *   and avoids floating-point surprises such as 0.1 + 0.2 = 0.30000000000000004.
 * - The discount is rounded to the nearest cent; exactly half a cent rounds up.
 * - The final amount is the original amount minus the rounded discount, so
 *   discountAmount + finalAmount always equals the original amount exactly.
 *
 * Example: 999.99 with 15% off. The exact discount is 149.9985, which rounds to 150.00,
 * leaving a final amount of 849.99.
 *
 * Expects an amount that validateAmount has accepted (0 or more, at most 2 decimal places)
 * and a whole-number discount percentage.
 */
export function calculateDiscount(amount: number, discountPercent: number): DiscountResult {
  // Math.round is needed because some decimals can't be stored exactly: 0.07 * 100 is 7.000000000000001.
  const amountInCents = Math.round(amount * 100); //            999.99 -> 99999
  const discountInCents = Math.round((amountInCents * discountPercent) / 100); // 14999.85 -> 15000
  const finalInCents = amountInCents - discountInCents; //       99999 - 15000 = 84999

  return {
    discountAmount: discountInCents / 100, // 150
    finalAmount: finalInCents / 100, //       849.99
  };
}
