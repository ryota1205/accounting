export function previewTax(fee: number): number {
  return Math.floor((fee * 10) / 100);
}

export function previewBilling(
  fee: number, transport: number, other: number, tax: number
): number {
  return fee + transport + other + tax;
}
