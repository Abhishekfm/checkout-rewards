# Checkout and Rewards Service

Express and TypeScript. Products, carts, orders, and coupons live in memory. Design notes are in [DECISIONS.md](DECISIONS.md).

No login. Routes under `/admin` are the administrative ones.

---

## Run

No database and no API keys.

```bash
npm install
npm run dev        # http://localhost:3000
npm test
npm start          # same server, without reload on save
```

| Variable           | Default | Meaning                                                |
| ------------------ | ------- | ------------------------------------------------------ |
| `N`                | 5       | Every Nth placed order unlocks one coupon. At least 1. |
| `X`                | 10      | Percent off on a new coupon. 1–99.                     |
| `PORT`             | 3000    | HTTP port.                                             |
| `PAYMENT_DELAY_MS` | 50      | Fake payment wait, then it approves.                   |

Data is gone on restart. Seed products are `p1`–`p5`. `p5` (Limited Edition Mug) has stock 3.

Amounts are whole paise (`INR`). `49900` is ₹499.00. Field names end in `Subunits`.

---

## Errors

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": {} } }
```

| Status | Code                                                                         | When                                                                |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`                                                           | Bad body, bad quantity, missing `Idempotency-Key`, or invalid JSON. |
| 402    | `PAYMENT_DECLINED`                                                           | Declined. Stock and coupon are given back.                          |
| 404    | `NOT_FOUND`                                                                  | Unknown URL.                                                        |
| 404    | `CART_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `ITEM_NOT_IN_CART`, `ORDER_NOT_FOUND` | That id does not exist.                                             |
| 409    | `CART_EMPTY`                                                                 | Empty cart.                                                         |
| 409    | `CART_ALREADY_CHECKED_OUT`                                                   | `details.orderId` is the existing order.                            |
| 409    | `CHECKOUT_IN_PROGRESS`                                                       | Payment for this cart is still running.                             |
| 409    | `INSUFFICIENT_STOCK`                                                         | `details.items`: `{ productId, requested, available }`.             |
| 409    | `COUPON_IN_USE`                                                              | Held by another checkout.                                           |
| 409    | `COUPON_ALREADY_REDEEMED`                                                    | Already used.                                                       |
| 409    | `IDEMPOTENCY_KEY_REUSED`                                                     | Same key, different cart or coupon.                                 |
| 409    | `NO_ELIGIBLE_MILESTONE`                                                      | None due. `details.nextMilestone`.                                  |
| 422    | `COUPON_INVALID`                                                             | Code does not exist.                                                |
| 502    | `PAYMENT_UNAVAILABLE`                                                        | Provider failed. Nothing charged. Safe to retry.                    |

---

## Shopper

**`GET /health`** → 200 `{ "ok": true }`

**`GET /products`** → 200 `{ products: [{ id, name, priceSubunits, stock }] }`

---

**`POST /carts`** → 201, empty cart, status `open`.

**`GET /carts/:cartId`** → 200. Prices are current. 404 `CART_NOT_FOUND`.

```json
{
  "id": "cart_...",
  "status": "open",
  "orderId": null,
  "currency": "INR",
  "items": [
    {
      "productId": "p1",
      "name": "Classic T-Shirt",
      "unitPriceSubunits": 49900,
      "quantity": 2,
      "lineTotalSubunits": 99800,
      "available": true
    }
  ],
  "subtotalSubunits": 99800
}
```

`available` is false when stock is no longer enough for that line.

**`POST /carts/:cartId/items`** `{ "productId": "p1", "quantity": 2 }` → 200 cart. Adds to the quantity already there. Quantity is a whole number from 1 to 100.

404 `PRODUCT_NOT_FOUND`. 409 `INSUFFICIENT_STOCK`, `CHECKOUT_IN_PROGRESS`, or `CART_ALREADY_CHECKED_OUT`.

**`PATCH /carts/:cartId/items/:productId`** `{ "quantity": 3 }` → 200. Sets the quantity. Same errors, plus 404 `ITEM_NOT_IN_CART`.

**`DELETE /carts/:cartId/items/:productId`** → 200. 404 `ITEM_NOT_IN_CART`. 409 if the cart is not `open`.

---

**`POST /carts/:cartId/checkout`**

Header `Idempotency-Key` is required. Body `{ "couponCode": "SAVE-..." }` is optional. Codes are matched without caring about case.

- 201 order created.
- 200 same key, same cart, same coupon. A retry during payment waits for that same order.
- 400 missing key. 402 or 502 payment failed: stock and coupon are given back.

Takes the stock, holds the coupon, then a fake payment approves. No card is sent.

---

**`GET /orders/:orderId`** → 200. A copy from checkout. Later price changes do not affect it. 404 `ORDER_NOT_FOUND`.

```json
{
  "id": "ord_...",
  "cartId": "cart_...",
  "currency": "INR",
  "lines": [
    {
      "productId": "p1",
      "name": "Classic T-Shirt",
      "unitPriceSubunits": 49900,
      "quantity": 1,
      "lineTotalSubunits": 49900
    }
  ],
  "subtotalSubunits": 49900,
  "couponCode": null,
  "discountPercent": 0,
  "discountSubunits": 0,
  "totalSubunits": 49900,
  "createdAt": "..."
}
```

10% of 49900 is 4990. Rounded half up once, on the subtotal.

---

## Admin

**`PATCH /admin/products/:productId`** `{ "priceSubunits": 59900, "stock": 10 }` → 200. One or both. Price is a positive integer. Stock is 0 or more. 400 or 404.

**`POST /admin/coupons`** → 201 `{ code, milestone, percentOff, status, redeemedByOrderId, createdAt }`.

One coupon per milestone (`N`, `2N`, `3N`, …), lowest missing first. 0 orders → 409 `NO_ELIGIBLE_MILESTONE`. With `N` at 5, 10 orders make the first call milestone 5 and the next call milestone 10.

**`GET /admin/coupons`** → 200 `{ coupons: [...] }`

**`GET /admin/report`** → 200, read-only. A failed checkout is not counted.

```json
{
  "currency": "INR",
  "totalOrders": 1,
  "quantityByProduct": [
    { "productId": "p4", "name": "Notebook Pack", "quantity": 1 }
  ],
  "grossRevenueSubunits": 24950,
  "discountsSubunits": 0,
  "netRevenueSubunits": 24950,
  "coupons": { "generated": 0, "available": 0, "redeemed": 0, "reserved": 0 }
}
```

Gross is the sum of subtotals. Discounts and net are the sums of those fields on the orders.

---

## Tests

`npm test` hits the real server: overselling, the same idempotency key at once, two checkouts on one coupon, a declined payment, and the report.

---

## Not in this service

Login, a database, a real payment provider, and expiry for idempotency keys. See [DECISIONS.md](DECISIONS.md).

---

## Try it

```bash
CART=$(curl -s -X POST localhost:3000/carts | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -s -X POST localhost:3000/carts/$CART/items -H 'Content-Type: application/json' -d '{"productId":"p5","quantity":2}'
curl -s -X POST localhost:3000/carts/$CART/checkout -H 'Content-Type: application/json' -H 'Idempotency-Key: abc-1' -d '{}'
curl -s -D - -o /dev/null -X POST localhost:3000/carts/$CART/checkout -H 'Content-Type: application/json' -H 'Idempotency-Key: abc-1' -d '{}'
curl -s localhost:3000/admin/report
```

The second checkout with the same key is `200` and the same order.
