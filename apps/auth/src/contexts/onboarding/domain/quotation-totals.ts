export type PricedLine = { quantity: number; unitPriceKobo: number };

export type QuotationTotals = {
  subtotalKobo: number;
  discountKobo: number;
  taxableKobo: number;
  taxKobo: number;
  totalKobo: number;
};

const BASIS_POINTS = 10_000n;

function requireWholeKobo(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative whole number of kobo`);
  }
}

export function percentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) return 0;
  return Math.round(percent * 100);
}

export function computeTotals(
  lines: PricedLine[],
  discountKobo: number,
  taxRateBp: number,
): QuotationTotals {
  requireWholeKobo('discountKobo', discountKobo);
  requireWholeKobo('taxRateBp', taxRateBp);

  let subtotal = 0n;
  for (const line of lines) {
    requireWholeKobo('quantity', line.quantity);
    requireWholeKobo('unitPriceKobo', line.unitPriceKobo);
    subtotal += BigInt(line.quantity) * BigInt(line.unitPriceKobo);
  }

  const discount = BigInt(discountKobo) > subtotal ? subtotal : BigInt(discountKobo);
  const taxable = subtotal - discount;
  const tax = (taxable * BigInt(taxRateBp) + BASIS_POINTS / 2n) / BASIS_POINTS;

  return {
    subtotalKobo: Number(subtotal),
    discountKobo: Number(discount),
    taxableKobo: Number(taxable),
    taxKobo: Number(tax),
    totalKobo: Number(taxable + tax),
  };
}

export function koboToNgn(kobo: number): number {
  return Number((kobo / 100).toFixed(2));
}
