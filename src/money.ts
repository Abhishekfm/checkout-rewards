/** Percent of an integer amount, rounded half up to the nearest subunit. */
export function percentOf(amountSubunits: number, percent: number): number {
  return Math.floor((amountSubunits * percent + 50) / 100);
}
