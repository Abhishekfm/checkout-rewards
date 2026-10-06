export interface Product {
  id: string;
  name: string;
  priceSubunits: number;
  stock: number;
}

export const products = new Map<string, Product>();

const seedProducts: readonly Product[] = [
  { id: "p1", name: "Classic T-Shirt", priceSubunits: 49900, stock: 100 },
  { id: "p2", name: "Coffee Beans 1kg", priceSubunits: 89900, stock: 50 },
  { id: "p3", name: "Wireless Mouse", priceSubunits: 129900, stock: 25 },
  { id: "p4", name: "Notebook Pack", priceSubunits: 24950, stock: 200 },
  { id: "p5", name: "Limited Edition Mug", priceSubunits: 34900, stock: 3 },
];

/** Clears the product map and reloads copies of the seed products. */
export function resetStore(): void {
  products.clear();
  for (const product of seedProducts) {
    products.set(product.id, { ...product });
  }
}

resetStore();
