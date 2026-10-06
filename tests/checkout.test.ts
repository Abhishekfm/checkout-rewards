import { describe, expect, it } from "vitest";
import { api, cartWith, checkout, useServer } from "./helpers.js";

useServer();

async function stockOf(productId: string): Promise<number> {
  const { body } = await api("GET", "/products");
  return body.products.find((p: { id: string }) => p.id === productId).stock;
}

describe("checkout", () => {
  it("creates an order and takes stock", async () => {
    const cartId = await cartWith({ p5: 2, p4: 1 });
    const res = await checkout(cartId);
    expect(res.status).toBe(201);
    expect(res.body.totalSubunits).toBe(34900 * 2 + 24950);
    expect(await stockOf("p5")).toBe(1);

    const fetched = await api("GET", `/orders/${res.body.id}`);
    expect(fetched.body).toEqual(res.body);
  });

  it("does not oversell when many customers check out at the same time", async () => {
    // 10 carts each want 1 mug, only 3 exist. Adding to cart doesn't reserve, so all 10 get this far.
    const cartIds = await Promise.all(Array.from({ length: 10 }, () => cartWith({ p5: 1 })));

    const results = await Promise.all(cartIds.map((id) => checkout(id)));

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect(await stockOf("p5")).toBe(0);
    expect((await api("GET", "/admin/report")).body.totalOrders).toBe(3);
  });

  it("returns the same order when the same request is retried, even concurrently", async () => {
    const cartId = await cartWith({ p5: 1 });

    const results = await Promise.all(Array.from({ length: 5 }, () => checkout(cartId, { key: "retry-me" })));

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await stockOf("p5")).toBe(2);
  });

  it("rejects a second checkout of the same cart with a new key", async () => {
    const cartId = await cartWith({ p1: 1 });
    const first = await checkout(cartId);
    const second = await checkout(cartId);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CART_ALREADY_CHECKED_OUT");
    expect(second.body.error.details.orderId).toBe(first.body.id);
  });

  it("rejects reusing a key for a different cart", async () => {
    await checkout(await cartWith({ p1: 1 }), { key: "shared" });
    const res = await checkout(await cartWith({ p2: 1 }), { key: "shared" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("lets a failed checkout be retried with the same key once the problem is fixed", async () => {
    const cartId = await cartWith({ p5: 3 });
    await api("PATCH", "/admin/products/p5", { stock: 1 });
    expect((await checkout(cartId, { key: "k" })).status).toBe(409);

    await api("PATCH", "/admin/products/p5", { stock: 5 });
    expect((await checkout(cartId, { key: "k" })).status).toBe(201);
  });

  it("charges the price at checkout time and keeps it on the order afterwards", async () => {
    const cartId = await cartWith({ p1: 1 });
    await api("PATCH", "/admin/products/p1", { priceSubunits: 59900 });

    const order = (await checkout(cartId)).body;
    expect(order.lines[0].unitPriceSubunits).toBe(59900);

    await api("PATCH", "/admin/products/p1", { priceSubunits: 10000 });
    const later = (await api("GET", `/orders/${order.id}`)).body;
    expect(later.lines[0].unitPriceSubunits).toBe(59900);
    expect(later.totalSubunits).toBe(59900);
  });

  it("requires an Idempotency-Key and rejects empty carts", async () => {
    const { body: cart } = await api("POST", "/carts");
    expect((await api("POST", `/carts/${cart.id}/checkout`, {})).status).toBe(400);
    const empty = await checkout(cart.id);
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe("CART_EMPTY");
  });
});
