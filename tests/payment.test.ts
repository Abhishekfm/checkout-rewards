import { describe, expect, it } from "vitest";
import { PaymentDeclinedError, setPaymentGateway } from "../src/payment.js";
import { api, cartWith, checkout, useServer } from "./helpers.js";

useServer();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A gateway whose payments stay pending until the test calls approve() or decline(). */
function manualGateway() {
  const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
  setPaymentGateway({
    charge: () =>
      new Promise<void>((resolve, reject) => pending.push({ resolve, reject })),
  });
  return {
    get count() {
      return pending.length;
    },
    approve: () => pending.shift()!.resolve(),
    decline: () => pending.shift()!.reject(new PaymentDeclinedError()),
  };
}

async function stockOf(productId: string): Promise<number> {
  const { body } = await api("GET", "/products");
  return body.products.find((p: { id: string }) => p.id === productId).stock;
}

async function waitFor(condition: () => boolean) {
  while (!condition()) await sleep(1);
}

async function generateCoupon(): Promise<string> {
  for (let i = 0; i < 5; i++) await checkout(await cartWith({ p4: 1 }));
  return (await api("POST", "/admin/coupons")).body.code;
}

describe("payment", () => {
  it("gives back stock and coupon when payment is declined, and the same key can retry", async () => {
    const code = await generateCoupon();
    const cartId = await cartWith({ p5: 2 });
    setPaymentGateway({
      charge: async () => {
        throw new PaymentDeclinedError();
      },
    });

    const declined = await checkout(cartId, { key: "k", couponCode: code });
    expect(declined.status).toBe(402);
    expect(declined.body.error.code).toBe("PAYMENT_DECLINED");
    expect(await stockOf("p5")).toBe(3);
    expect((await api("GET", "/admin/coupons")).body.coupons[0].status).toBe(
      "available"
    );
    expect((await api("GET", `/carts/${cartId}`)).body.status).toBe("open");

    setPaymentGateway({ charge: async () => {} });
    const retried = await checkout(cartId, { key: "k", couponCode: code });
    expect(retried.status).toBe(201);
    expect(await stockOf("p5")).toBe(1);
  });

  it("lets the same key retry even when the provider fails instantly", async () => {
    const cartId = await cartWith({ p1: 1 });
    setPaymentGateway({
      charge: () => {
        throw new Error("connection refused");
      },
    });
    const failed = await checkout(cartId, { key: "k" });
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("PAYMENT_UNAVAILABLE");

    setPaymentGateway({ charge: async () => {} });
    expect((await checkout(cartId, { key: "k" })).status).toBe(201);
  });

  it("holds stock and coupon while payment is running", async () => {
    const code = await generateCoupon();
    const gateway = manualGateway();
    const first = checkout(await cartWith({ p5: 3 }), { couponCode: code });
    await waitFor(() => gateway.count === 1);

    // Payment for the first checkout is still running. Its stock and coupon are already taken.
    expect(await stockOf("p5")).toBe(0);
    const competitor = await checkout(await cartWith({ p1: 1 }), {
      couponCode: code,
    });
    expect(competitor.body.error.code).toBe("COUPON_IN_USE");

    gateway.approve();
    expect((await first).status).toBe(201);
    expect((await api("GET", "/admin/coupons")).body.coupons[0].status).toBe(
      "redeemed"
    );
  });

  it("blocks cart edits and second checkouts while payment is running", async () => {
    const gateway = manualGateway();
    const cartId = await cartWith({ p1: 1 });
    const first = checkout(cartId, { key: "original" });
    await waitFor(() => gateway.count === 1);

    const edit = await api("POST", `/carts/${cartId}/items`, {
      productId: "p2",
      quantity: 1,
    });
    expect(edit.body.error.code).toBe("CHECKOUT_IN_PROGRESS");
    expect((await checkout(cartId, { key: "different" })).body.error.code).toBe(
      "CHECKOUT_IN_PROGRESS"
    );

    // A retry with the original key waits for the same payment and gets the same order.
    const retry = checkout(cartId, { key: "original" });
    gateway.approve();
    const [a, b] = await Promise.all([first, retry]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(gateway.count).toBe(0);
  });

  it("doesn't make other customers wait for someone else's payment", async () => {
    setPaymentGateway({ charge: () => sleep(200) });
    const carts = await Promise.all([
      cartWith({ p1: 1 }),
      cartWith({ p1: 1 }),
      cartWith({ p2: 1 }),
    ]);

    const started = Date.now();
    const results = await Promise.all(carts.map((id) => checkout(id)));
    const elapsed = Date.now() - started;

    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(elapsed).toBeLessThan(450);
  });
});
