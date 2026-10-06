import { describe, expect, it } from "vitest";
import { api, useServer } from "./helpers.js";

useServer();

describe("products", () => {
  it("lists the seeded products", async () => {
    const { status, body } = await api("GET", "/products");
    expect(status).toBe(200);
    expect(body.products).toHaveLength(5);
    expect(body.products.find((p: { id: string }) => p.id === "p5").stock).toBe(
      3
    );
  });

  it("lets an admin change price and stock", async () => {
    const res = await api("PATCH", "/admin/products/p1", {
      priceSubunits: 59900,
      stock: 7,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ priceSubunits: 59900, stock: 7 });
  });

  it("rejects invalid admin edits", async () => {
    for (const body of [
      { priceSubunits: 0 },
      { priceSubunits: 99.5 },
      { stock: -1 },
      {},
    ]) {
      expect(
        (await api("PATCH", "/admin/products/p1", body)).status,
        JSON.stringify(body)
      ).toBe(400);
    }
    expect(
      (await api("PATCH", "/admin/products/nope", { stock: 1 })).status
    ).toBe(404);
  });
});
