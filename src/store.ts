export const CURRENCY = "INR";

export interface Product {
  id: string;
  name: string;
  priceSubunits: number;
  stock: number;
}

export interface Cart {
  id: string;
  status: "open" | "checking_out" | "checked_out";
  /** productId -> quantity. Prices are looked up live, never stored on the cart. */
  items: Map<string, number>;
  orderId?: string;
  createdAt: string;
}

export interface Coupon {
  code: string;
  /** The order count that unlocked this coupon, e.g. 5, 10, 15 when n = 5. */
  milestone: number;
  percentOff: number;
  /** reserved = held by a checkout whose payment is still running. */
  status: "available" | "reserved" | "redeemed";
  redeemedByOrderId: string | null;
  createdAt: string;
}

export const products = new Map<string, Product>();
export const carts = new Map<string, Cart>();
/** Empty until checkout creates orders. Coupon generation only needs the count. */
export const orders = new Map<string, { id: string }>();
export const coupons = new Map<string, Coupon>();

const seedProducts: readonly Product[] = [
  { id: "p1", name: "Classic T-Shirt", priceSubunits: 49900, stock: 100 },
  { id: "p2", name: "Coffee Beans 1kg", priceSubunits: 89900, stock: 50 },
  { id: "p3", name: "Wireless Mouse", priceSubunits: 129900, stock: 25 },
  { id: "p4", name: "Notebook Pack", priceSubunits: 24950, stock: 200 },
  { id: "p5", name: "Limited Edition Mug", priceSubunits: 34900, stock: 3 },
];

/** Clears stored data and reloads copies of the seed products. */
export function resetStore(): void {
  products.clear();
  carts.clear();
  orders.clear();
  coupons.clear();
  for (const product of seedProducts) {
    products.set(product.id, { ...product });
  }
}

resetStore();
