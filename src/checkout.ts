import { randomUUID } from "node:crypto";
import { getCart } from "./cart.js";
import { AppError } from "./errors.js";
import { percentOf } from "./money.js";
import { PaymentDeclinedError, getPaymentGateway } from "./payment.js";
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
 * Checkout runs in three phases:
 *
 * 1. Reserve (synchronous): check everything, then take the stock, hold the coupon and
 *    mark the cart as checking_out. There is no `await` before this phase finishes, so
 *    no other request can run in the middle of it.
 * 2. Pay (asynchronous): other requests run while we wait for the payment provider.
 * 3. Confirm or release (synchronous): save the order, or give the stock and coupon back.
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

  const reservation = reserve(cartId, couponCode);
  const result = payAndConfirm(reservation);
  // Save the promise before awaiting it, so a retry that arrives mid-payment waits for this same charge.
  idempotencyKeys.set(idempotencyKey, { fingerprint, result });
  result.catch(() => {
    if (idempotencyKeys.get(idempotencyKey)?.result === result)
      idempotencyKeys.delete(idempotencyKey);
  });
  return { created: true, order: await result };
}

interface Reservation {
  cart: Cart;
  coupon: Coupon | undefined;
  order: Order;
}

/** Phase 1. Synchronous: checks first, then writes. If any check fails, nothing has changed. */
function reserve(cartId: string, couponCode: string | null): Reservation {
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

  const coupon = couponCode ? coupons.get(couponCode) : undefined;
  if (couponCode && !coupon) {
    throw new AppError("COUPON_INVALID", `Coupon ${couponCode} does not exist`);
  }
  if (coupon?.status === "reserved") {
    throw new AppError(
      "COUPON_IN_USE",
      `Coupon ${coupon.code} is being used by another checkout`
    );
  }
  if (coupon?.status === "redeemed") {
    throw new AppError(
      "COUPON_ALREADY_REDEEMED",
      `Coupon ${coupon.code} has already been used`
    );
  }

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

  const order: Order = {
    id: `ord_${randomUUID()}`,
    cartId,
    lines,
    subtotalSubunits,
    couponCode: coupon?.code ?? null,
    discountPercent,
    discountSubunits,
    totalSubunits: subtotalSubunits - discountSubunits,
    createdAt: new Date().toISOString(),
  };

  for (const line of lines) {
    products.get(line.productId)!.stock -= line.quantity;
  }
  if (coupon) coupon.status = "reserved";
  cart.status = "checking_out";

  return { cart, coupon, order };
}

/** Phases 2 and 3. Confirm the order, or give the stock and coupon back. */
async function payAndConfirm({
  cart,
  coupon,
  order,
}: Reservation): Promise<Order> {
  try {
    await getPaymentGateway().charge(order.totalSubunits, order.id);
  } catch (err) {
    for (const line of order.lines) {
      products.get(line.productId)!.stock += line.quantity;
    }
    if (coupon) coupon.status = "available";
    cart.status = "open";

    if (err instanceof PaymentDeclinedError) {
      throw new AppError(
        "PAYMENT_DECLINED",
        "Payment was declined; nothing was charged"
      );
    }
    throw new AppError(
      "PAYMENT_UNAVAILABLE",
      "Payment provider failed; nothing was charged"
    );
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

export function getOrder(orderId: string): Order {
  const order = orders.get(orderId);
  if (!order)
    throw new AppError("ORDER_NOT_FOUND", `Order ${orderId} does not exist`);
  return order;
}

export function orderView(order: Order) {
  return { ...order, currency: CURRENCY };
}
