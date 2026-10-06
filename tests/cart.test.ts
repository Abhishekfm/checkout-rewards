import { describe, expect, it } from "vitest";
import { api, cartWith, checkout, url, useServer } from "./helpers.js";

useServer();

describe("cart", () => {
  it("shows live prices and totals", async () => {
    const cartId = await cartWith({ p1: 2, p4: 1 });
    const { status, body } = await api("GET", `/carts/${cartId}`);
    expect(status).toBe(200);
    expect(body.subtotalSubunits).toBe(49900 * 2 + 24950);
    expect(body.currency).toBe("INR");
  });

  it("rejects invalid quantities and unknown products", async () => {
    const { body: cart } = await api("POST", "/carts");
    for (const quantity of [0, -1, 1.5, "2", null, 101]) {
      const res = await api("POST", `/carts/${cart.id}/items`, { productId: "p1", quantity });
      expect(res.status, `quantity ${JSON.stringify(quantity)}`).toBe(400);
    }
    const unknown = await api("POST", `/carts/${cart.id}/items`, { productId: "nope", quantity: 1 });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("PRODUCT_NOT_FOUND");

    const { body: after } = await api("GET", `/carts/${cart.id}`);
    expect(after.items).toEqual([]);
  });

  it("rejects adding more than is in stock", async () => {
    const { body: cart } = await api("POST", "/carts");
    const res = await api("POST", `/carts/${cart.id}/items`, { productId: "p5", quantity: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("updates and removes items", async () => {
    const cartId = await cartWith({ p1: 1, p2: 1 });
    expect((await api("PATCH", `/carts/${cartId}/items/p1`, { quantity: 5 })).body.items[0].quantity).toBe(5);
    expect((await api("DELETE", `/carts/${cartId}/items/p2`)).body.items).toHaveLength(1);
    expect((await api("DELETE", `/carts/${cartId}/items/p2`)).status).toBe(404);
  });

  it("returns the standard error shape for unknown URLs and invalid JSON", async () => {
    const unknown = await api("GET", "/nope");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("NOT_FOUND");

    const { body: cart } = await api("POST", "/carts");
    const bad = await fetch(url(`/carts/${cart.id}/items`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("can't be changed after checkout", async () => {
    const cartId = await cartWith({ p1: 1 });
    expect((await checkout(cartId)).status).toBe(201);
    const res = await api("POST", `/carts/${cartId}/items`, { productId: "p2", quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CART_ALREADY_CHECKED_OUT");
  });
});
