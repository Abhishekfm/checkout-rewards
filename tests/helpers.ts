import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { resetStore } from "../src/store.js";

let server: Server;
let baseUrl = "";

/** Starts the real HTTP server on a random port and resets data before each test. */
export function useServer(): void {
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    resetStore();
  });
}

export function url(path: string): string {
  return baseUrl + path;
}

/** Builds an open cart with the given product quantities. */
export async function cartWith(items: Record<string, number>): Promise<string> {
  const { body: cart } = await api("POST", "/carts");
  for (const [productId, quantity] of Object.entries(items)) {
    const res = await api("POST", `/carts/${cart.id}/items`, { productId, quantity });
    if (res.status !== 200) throw new Error(`setup failed: ${JSON.stringify(res.body)}`);
  }
  return cart.id;
}

export async function api(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

let keyCounter = 0;
export function checkout(cartId: string, opts: { key?: string; couponCode?: string } = {}) {
  const key = opts.key ?? `key-${++keyCounter}`;
  return api("POST", `/carts/${cartId}/checkout`, { couponCode: opts.couponCode }, { "Idempotency-Key": key });
}
