import { CURRENCY, coupons, orders } from "./store.js";

/** Read-only. Everything is recomputed from orders and coupons, so it always matches them. */
export function buildReport() {
  const byProduct = new Map<string, { productId: string; name: string; quantity: number }>();
  let grossRevenueSubunits = 0;
  let discountsSubunits = 0;
  let netRevenueSubunits = 0;

  for (const order of orders.values()) {
    grossRevenueSubunits += order.subtotalSubunits;
    discountsSubunits += order.discountSubunits;
    netRevenueSubunits += order.totalSubunits;
    for (const line of order.lines) {
      const entry = byProduct.get(line.productId) ?? { productId: line.productId, name: line.name, quantity: 0 };
      entry.quantity += line.quantity;
      byProduct.set(line.productId, entry);
    }
  }

  const allCoupons = Array.from(coupons.values());
  const count = (status: string) => allCoupons.filter((c) => c.status === status).length;

  return {
    currency: CURRENCY,
    totalOrders: orders.size,
    quantityByProduct: Array.from(byProduct.values()),
    grossRevenueSubunits,
    discountsSubunits,
    netRevenueSubunits,
    coupons: {
      generated: allCoupons.length,
      available: count("available"),
      redeemed: count("redeemed"),
      /** Held by a checkout whose payment is still running. */
      reserved: count("reserved"),
    },
  };
}
