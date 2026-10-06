import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import { CURRENCY, carts, products, type Cart, type Product } from "./store.js";

export const MAX_QUANTITY_PER_ITEM = 100;

export function createCart(): Cart {
  const cart: Cart = {
    id: `cart_${randomUUID()}`,
    status: "open",
    items: new Map(),
    createdAt: new Date().toISOString(),
  };
  carts.set(cart.id, cart);
  return cart;
}

export function getCart(cartId: string): Cart {
  const cart = carts.get(cartId);
  if (!cart) throw new AppError("CART_NOT_FOUND", `Cart ${cartId} does not exist`);
  return cart;
}

function getOpenCart(cartId: string): Cart {
  const cart = getCart(cartId);
  if (cart.status === "checking_out") {
    throw new AppError("CHECKOUT_IN_PROGRESS", "This cart is being checked out and can't be changed");
  }
  if (cart.status === "checked_out") {
    throw new AppError("CART_ALREADY_CHECKED_OUT", "This cart has already been checked out", {
      orderId: cart.orderId,
    });
  }
  return cart;
}

function getProduct(productId: unknown): Product {
  if (typeof productId !== "string" || productId === "") {
    throw new AppError("VALIDATION_ERROR", "productId must be a non-empty string");
  }
  const product = products.get(productId);
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", `Product ${productId} does not exist`);
  return product;
}

function validateQuantity(quantity: unknown): number {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
    throw new AppError("VALIDATION_ERROR", `quantity must be an integer between 1 and ${MAX_QUANTITY_PER_ITEM}`);
  }
  return quantity;
}

/** Early stock check. The check that prevents overselling happens at checkout. */
function ensureInStock(product: Product, quantity: number): void {
  if (quantity > product.stock) {
    throw new AppError("INSUFFICIENT_STOCK", `Only ${product.stock} of ${product.name} available`, {
      items: [{ productId: product.id, requested: quantity, available: product.stock }],
    });
  }
}

export function addItem(cartId: string, productId: unknown, quantity: unknown): Cart {
  const cart = getOpenCart(cartId);
  const product = getProduct(productId);
  const newQuantity = (cart.items.get(product.id) ?? 0) + validateQuantity(quantity);
  validateQuantity(newQuantity);
  ensureInStock(product, newQuantity);
  cart.items.set(product.id, newQuantity);
  return cart;
}

export function setItemQuantity(cartId: string, productId: string, quantity: unknown): Cart {
  const cart = getOpenCart(cartId);
  if (!cart.items.has(productId)) {
    throw new AppError("ITEM_NOT_IN_CART", `Product ${productId} is not in this cart`);
  }
  const product = getProduct(productId);
  const newQuantity = validateQuantity(quantity);
  ensureInStock(product, newQuantity);
  cart.items.set(productId, newQuantity);
  return cart;
}

export function removeItem(cartId: string, productId: string): Cart {
  const cart = getOpenCart(cartId);
  if (!cart.items.delete(productId)) {
    throw new AppError("ITEM_NOT_IN_CART", `Product ${productId} is not in this cart`);
  }
  return cart;
}

/** What the client sees: live prices, line totals, and whether each line can still be bought. */
export function cartView(cart: Cart) {
  const items = Array.from(cart.items, ([productId, quantity]) => {
    const product = products.get(productId)!;
    return {
      productId,
      name: product.name,
      unitPriceSubunits: product.priceSubunits,
      quantity,
      lineTotalSubunits: product.priceSubunits * quantity,
      available: product.stock >= quantity,
    };
  });
  return {
    id: cart.id,
    status: cart.status,
    orderId: cart.orderId ?? null,
    currency: CURRENCY,
    items,
    subtotalSubunits: items.reduce((sum, item) => sum + item.lineTotalSubunits, 0),
  };
}
