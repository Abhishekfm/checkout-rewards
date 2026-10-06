import { describe, expect, it } from "vitest";
import { percentOf } from "../src/money.js";
import { api, cartWith, checkout, useServer } from "./helpers.js";

useServer();

/** Default config: n = 5, x = 10. */
async function placeOrders(count: number) {
  for (let i = 0; i < count; i++) {
    expect((await checkout(await cartWith({ p4: 1 }))).status).toBe(201);
  }
}

describe("coupons", () => {
  it("is only generated once the milestone is reached, and once per milestone", async () => {
    await placeOrders(4);
    expect((await api("POST", "/admin/coupons")).body.error.code).toBe("NO_ELIGIBLE_MILESTONE");

    await placeOrders(1);
    const first = await api("POST", "/admin/coupons");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ milestone: 5, percentOff: 10, status: "available" });

    expect((await api("POST", "/admin/coupons")).status).toBe(409);
  });

  it("doesn't lose milestones if the admin falls behind", async () => {
    await placeOrders(10);
    expect((await api("POST", "/admin/coupons")).body.milestone).toBe(5);
    expect((await api("POST", "/admin/coupons")).body.milestone).toBe(10);
    expect((await api("POST", "/admin/coupons")).status).toBe(409);
  });

  it("creates only one coupon when two admins generate at the same time", async () => {
    await placeOrders(5);
    const results = await Promise.all([api("POST", "/admin/coupons"), api("POST", "/admin/coupons")]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("applies the discount and can only be redeemed once", async () => {
    await placeOrders(5);
    const { code } = (await api("POST", "/admin/coupons")).body;

    const order = (await checkout(await cartWith({ p1: 1 }), { couponCode: code })).body;
    expect(order.discountSubunits).toBe(4990);
    expect(order.totalSubunits).toBe(49900 - 4990);

    const again = await checkout(await cartWith({ p1: 1 }), { couponCode: code });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("COUPON_ALREADY_REDEEMED");
  });

  it("can't be redeemed by two checkouts at the same time", async () => {
    await placeOrders(5);
    const { code } = (await api("POST", "/admin/coupons")).body;
    const [a, b] = await Promise.all([cartWith({ p1: 1 }), cartWith({ p2: 1 })]);

    const results = await Promise.all([checkout(a, { couponCode: code }), checkout(b, { couponCode: code })]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const coupons = (await api("GET", "/admin/coupons")).body.coupons;
    expect(coupons[0].status).toBe("redeemed");
  });

  it("is not used up by a checkout that fails", async () => {
    await placeOrders(5);
    const { code } = (await api("POST", "/admin/coupons")).body;

    const cartId = await cartWith({ p5: 3 });
    await api("PATCH", "/admin/products/p5", { stock: 0 });
    expect((await checkout(cartId, { couponCode: code })).body.error.code).toBe("INSUFFICIENT_STOCK");
    expect((await api("GET", "/admin/coupons")).body.coupons[0].status).toBe("available");

    expect((await checkout(await cartWith({ p1: 1 }), { couponCode: code })).status).toBe(201);
  });

  it("rejects unknown codes", async () => {
    const res = await checkout(await cartWith({ p1: 1 }), { couponCode: "NOPE" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("COUPON_INVALID");
  });

  it("rounds discounts half up to the nearest subunit", () => {
    expect(percentOf(1005, 10)).toBe(101);
    expect(percentOf(1004, 10)).toBe(100);
    expect(percentOf(1, 10)).toBe(0);
  });
});
