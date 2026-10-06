function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value))
    throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

/** Every n-th placed order unlocks one coupon worth x percent off. */
export const config = {
  n: readInt("N", 5),
  x: readInt("X", 10),
};

if (config.n < 1) throw new Error(`N must be at least 1, got ${config.n}`);
// Below 100 so a discount can never take a total to zero or below.
if (config.x < 1 || config.x > 99)
  throw new Error(`X must be between 1 and 99, got ${config.x}`);
