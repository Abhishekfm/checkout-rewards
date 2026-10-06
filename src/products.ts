import { products, type Product } from "./store.js";

export class ProductRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function listProducts(): Product[] {
  return Array.from(products.values());
}

/** Admin: change price and/or stock. we will add tests to simulate a price change or restock. */
export function updateProduct(
  productId: string,
  body: { priceSubunits?: unknown; stock?: unknown }
): Product {
  const product = products.get(productId);
  if (!product)
    throw new ProductRequestError(404, `Product ${productId} does not exist`);

  const { priceSubunits, stock } = body;
  if (priceSubunits === undefined && stock === undefined) {
    throw new ProductRequestError(400, "Provide priceSubunits and/or stock");
  }
  if (
    priceSubunits !== undefined &&
    (!isNonNegativeInt(priceSubunits) || priceSubunits === 0)
  ) {
    throw new ProductRequestError(
      400,
      "priceSubunits must be a positive integer"
    );
  }
  if (stock !== undefined && !isNonNegativeInt(stock)) {
    throw new ProductRequestError(400, "stock must be a non-negative integer");
  }

  if (priceSubunits !== undefined) product.priceSubunits = priceSubunits;
  if (stock !== undefined) product.stock = stock;
  return product;
}
