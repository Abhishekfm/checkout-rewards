import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { coupons, orders, type Coupon } from "./store.js";

function newCouponCode(): string {
  let code: string;
  do {
    code = `SAVE-${randomBytes(4).toString("hex").toUpperCase()}`;
  } while (coupons.has(code));
  return code;
}

/**
 * Creates the coupon for the lowest milestone that does not have one yet.
 * Milestones are n, 2n, 3n... placed orders, and each gets exactly one coupon.
 * Synchronous, so two simultaneous calls can't both create the same milestone.
 */
export function generateCoupon(): Coupon {
  const placedOrders = orders.size;
  const milestonesReached = Math.floor(placedOrders / config.n);
  const milestonesRewarded = coupons.size;

  if (milestonesRewarded >= milestonesReached) {
    throw new AppError(
      "NO_ELIGIBLE_MILESTONE",
      "No order milestone is waiting for a coupon",
      {
        placedOrders,
        n: config.n,
        nextMilestone: (milestonesRewarded + 1) * config.n,
      }
    );
  }

  const coupon: Coupon = {
    code: newCouponCode(),
    milestone: (milestonesRewarded + 1) * config.n,
    percentOff: config.x,
    status: "available",
    redeemedByOrderId: null,
    createdAt: new Date().toISOString(),
  };
  coupons.set(coupon.code, coupon);
  return coupon;
}

export function listCoupons(): Coupon[] {
  return Array.from(coupons.values());
}
