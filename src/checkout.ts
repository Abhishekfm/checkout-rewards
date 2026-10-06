import { randomUUID } from "node:crypto";
import { getCart } from "./cart.js";
import { AppError } from "./errors.js";
import { percentOf } from "./money.js";
import {
  CURRENCY,
  coupons,
  idempotencyKeys,
  orders,
  products,
  type Cart,
  type Coupon,
  type Order,
  type OrderLine,
} from "./store.js";

export interface CheckoutResult {
  /** true when this request created the order, false when it replayed an earlier one. */
  created: boolean;
  order: Order;
}

export function normalizeCouponCode(code: unknown): string | null {
  if (code === undefined || code === null) return null;
  if (typeof code !== "string" || code.trim() === "") {
    throw new AppError(
      "VALIDATION_ERROR",
      "couponCode must be a non-empty string when provided"
    );
  }
  return code.trim().toUpperCase();
}

/**
 * Synchronous checkout: check everything, then write.
 * There is no await before the order is saved, so two checkouts cannot
 * both pass the stock or coupon check for the same units.
 */
export async function checkout(
  cartId: string,
  idempotencyKey: unknown,
  rawCouponCode: unknown
): Promise<CheckoutResult> {
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.trim() === "" ||
    idempotencyKey.length > 200
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Idempotency-Key header is required (max 200 characters)"
    );
  }
  const couponCode = normalizeCouponCode(rawCouponCode);
  const fingerprint = JSON.stringify({ cartId, couponCode });

  const previous = idempotencyKeys.get(idempotencyKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used for a different request"
      );
    }
    return { created: false, order: await previous.result };
  }

  const order = commitCheckout(cartId, couponCode);
  idempotencyKeys.set(idempotencyKey, {
    fingerprint,
    result: Promise.resolve(order),
  });
  return { created: true, order };
}

/** Checks first. If any check fails, nothing has changed. */
function commitCheckout(cartId: string, couponCode: string | null): Order {
  const cart = getCart(cartId);
  if (cart.status === "checking_out") {
    throw new AppError(
      "CHECKOUT_IN_PROGRESS",
      "This cart is already being checked out"
    );
  }
  if (cart.status === "checked_out") {
    throw new AppError(
      "CART_ALREADY_CHECKED_OUT",
      "This cart has already been checked out",
      {
        orderId: cart.orderId,
      }
    );
  }
  if (cart.items.size === 0) {
    throw new AppError("CART_EMPTY", "Cannot check out an empty cart");
  }

  const shortages = [];
  for (const [productId, quantity] of cart.items) {
    const product = products.get(productId)!;
    if (product.stock < quantity) {
      shortages.push({
        productId,
        requested: quantity,
        available: product.stock,
      });
    }
  }
  if (shortages.length > 0) {
    throw new AppError(
      "INSUFFICIENT_STOCK",
      "Some items no longer have enough stock",
      { items: shortages }
    );
  }

  const coupon = takeCoupon(couponCode);
  const order = buildOrder(cart, coupon);

  for (const line of order.lines) {
    products.get(line.productId)!.stock -= line.quantity;
  }
  if (coupon) {
    coupon.status = "redeemed";
    coupon.redeemedByOrderId = order.id;
  }
  orders.set(order.id, order);
  cart.status = "checked_out";
  cart.orderId = order.id;
  return order;
}

function takeCoupon(couponCode: string | null): Coupon | undefined {
  if (!couponCode) return undefined;
  const coupon = coupons.get(couponCode);
  if (!coupon)
    throw new AppError("COUPON_INVALID", `Coupon ${couponCode} does not exist`);
  if (coupon.status !== "available") {
    throw new AppError(
      "COUPON_ALREADY_REDEEMED",
      `Coupon ${coupon.code} has already been used`
    );
  }
  return coupon;
}

function buildOrder(cart: Cart, coupon: Coupon | undefined): Order {
  const lines: OrderLine[] = Array.from(cart.items, ([productId, quantity]) => {
    const product = products.get(productId)!;
    return {
      productId,
      name: product.name,
      unitPriceSubunits: product.priceSubunits,
      quantity,
      lineTotalSubunits: product.priceSubunits * quantity,
    };
  });
  const subtotalSubunits = lines.reduce(
    (sum, line) => sum + line.lineTotalSubunits,
    0
  );
  const discountPercent = coupon?.percentOff ?? 0;
  const discountSubunits = Math.min(
    percentOf(subtotalSubunits, discountPercent),
    subtotalSubunits
  );

  return {
    id: `ord_${randomUUID()}`,
    cartId: cart.id,
    lines,
    subtotalSubunits,
    couponCode: coupon?.code ?? null,
    discountPercent,
    discountSubunits,
    totalSubunits: subtotalSubunits - discountSubunits,
    createdAt: new Date().toISOString(),
  };
}

export function getOrder(orderId: string): Order {
  const order = orders.get(orderId);
  if (!order)
    throw new AppError("ORDER_NOT_FOUND", `Order ${orderId} does not exist`);
  return order;
}

export function orderView(order: Order) {
  return { ...order, currency: CURRENCY };
}
