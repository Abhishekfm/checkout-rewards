import { describe, expect, it } from "vitest";
import { api, cartWith, checkout, useServer } from "./helpers.js";

useServer();

describe("report", () => {
  it("matches the orders and coupons, and doesn't change anything when read", async () => {
    const orders: { subtotalSubunits: number; discountSubunits: number; totalSubunits: number }[] = [];
    for (let i = 0; i < 5; i++) orders.push((await checkout(await cartWith({ p4: 2 }))).body);
    const { code } = (await api("POST", "/admin/coupons")).body;
    await api("POST", "/admin/coupons"); // not eligible, must not affect the report
    orders.push((await checkout(await cartWith({ p1: 1, p4: 1 }), { couponCode: code })).body);
    await checkout(await cartWith({ p5: 3 }), { couponCode: "NOPE" }); // fails, must not count

    const first = (await api("GET", "/admin/report")).body;
    const second = (await api("GET", "/admin/report")).body;
    expect(second).toEqual(first);

    const sum = (field: "subtotalSubunits" | "discountSubunits" | "totalSubunits") =>
      orders.reduce((total, order) => total + order[field], 0);
    expect(first.totalOrders).toBe(6);
    expect(first.grossRevenueSubunits).toBe(sum("subtotalSubunits"));
    expect(first.discountsSubunits).toBe(sum("discountSubunits"));
    expect(first.netRevenueSubunits).toBe(sum("totalSubunits"));
    expect(first.netRevenueSubunits).toBe(first.grossRevenueSubunits - first.discountsSubunits);
    expect(first.coupons).toEqual({ generated: 1, available: 0, redeemed: 1, reserved: 0 });

    const qty = Object.fromEntries(first.quantityByProduct.map((p: { productId: string; quantity: number }) => [p.productId, p.quantity]));
    expect(qty).toEqual({ p4: 11, p1: 1 });
  });
});
