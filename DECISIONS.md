# Decisions

## Invariants

1. Stock never goes below zero. It is taken in `reserve()` before any `await`.
2. A cart becomes at most one order. Status goes `open` → `checking_out` → `checked_out`, or back to `open` if payment fails. No order is saved in that failure case.
3. A retried checkout does not create a second order or take the stock twice.
4. A coupon is redeemed once. It is `reserved` during payment and `redeemed` only after payment succeeds.
5. Order total = subtotal − discount, and the total is never negative. `X` is limited to 1–99.
6. One coupon per milestone. `generateCoupon()` in `src/coupons.ts`.
7. The report is added up from orders and coupons on every call. Reading it changes nothing.

## Ambiguities

- **Price changes after add.** The cart stores product id and quantity. Checkout uses the price at that moment and copies it onto the order.
- **Stock changes after add.** Adding to the cart does not hold stock. Checkout is the real check. If there isn't enough, the response is `409 INSUFFICIENT_STOCK` and it lists what is short.
- **"Every n-th order".** Every placed order counts, including ones that used a coupon. Milestones are 5, 10, 15 when `N` is 5.
- **Missed milestones.** If 10 orders happen before anyone asks, the first call makes the coupon for 5 and the next call makes the one for 10.
- **Coupon scope.** Any open cart can use an available coupon. One coupon per order. No expiry. The percent is fixed when the coupon is created.
- **Codes.** `SAVE-` plus random hex, so they are hard to guess. Matched without caring about case.
- **"Total discounts granted".** The sum of discounts on orders, not the value of coupons that were never used.

## Decision: Keep data in Maps

**Context:** Products, carts, orders, and coupons need to live somewhere.

**Options considered:** Postgres, SQLite, or plain Maps.

**Choice:** Maps in `src/store.ts`.

**Why:** Nothing to install, and the hard part is checkout, not storage.

**Consequences:** Data is gone on restart, and this only works as one process. Tests call `resetStore()`. Seed products are copied in, so a stock change does not edit the seed list.

## Decision: Reserve, then pay, then confirm

**Context:** Two customers can buy the last mug at the same time. Payment is slow, so other requests run while it waits.

**Options considered:** Keep checkout fully synchronous. Check the stock, pay, then take the stock. Lock the product until payment finishes. Reserve first, then pay.

**Choice:** Reserve first, in `src/checkout.ts`.

**Why:** A fully sync checkout breaks as soon as payment has an `await`. Checking and then taking the stock lets both buyers pass the check. A lock makes every buyer of that product wait for the previous payment.

**Consequences:** While payment is still running, the stock already looks taken. Another buyer can get `INSUFFICIENT_STOCK` for a mug that comes back if that payment fails. Other buyers do not wait for it. If the process dies mid-payment, the hold disappears with the rest of the in-memory data.

## Decision: Require an Idempotency-Key

**Context:** A client that times out will send checkout again. That retry must not create a second order.

**Options considered:** Treat the cart id as the key, or require an `Idempotency-Key` header.

**Choice:** Required header. The key is stored with the cart id and the coupon code.

**Why:** The key is saved before payment waits. The same key and the same request return the original order with `200`, including a retry that arrives while payment is still running. A failed checkout forgets the key, so that same key can be sent again. The same key on a different cart or coupon is `409 IDEMPOTENCY_KEY_REUSED`, which is separate from "this cart is already checked out".

**Consequences:** A key from a successful checkout stays in memory until the process restarts. Nothing expires it.

## Decision: Store money as whole paise

**Context:** Floats make `19.99 * 3` come out as `59.97000000000001`.

**Options considered:** Floats, a decimal library, or integers.

**Choice:** Integers in the smallest unit. `49900` is ₹499.00. Field names end in `Subunits`.

**Why:** The math stays exact, and there is no extra library. The only division is the percent off.

**Consequences:** `Math.floor((amount * percent + 50) / 100)` rounds .5 up to the next paisa. The discount is taken once, on the order total, not on each line.

## Decision: Copy the price onto the order

**Context:** An old order still has to show what was bought if the product is later renamed or repriced.

**Options considered:** Store the product id and look up the current price, or copy the name and price onto the order.

**Choice:** Each line copies name, unit price, quantity, and line total. The order also stores subtotal, coupon, discount percent, discount amount, and total.

**Why:** A live lookup would change old orders when the price changes.

**Consequences:** Every order line stores the name and price a second time, as well as on the product.

## Errors

Every error is `{ error: { code, message, details } }`. Clients should branch on `code`.

| Status | Meaning                                                              |
| ------ | -------------------------------------------------------------------- |
| 400    | The request is wrong. Fix it.                                        |
| 402    | Payment declined. Nothing was kept.                                  |
| 404    | Unknown URL, or the cart, product, item, or order was not found.     |
| 409    | Stock, cart state, coupon, or a reused key. Refresh and maybe retry. |
| 422    | The coupon code does not exist.                                      |
| 502    | The payment provider failed. Safe to retry.                          |

`details` carries the short items, or the existing `orderId` when a cart was already checked out.

## Done and left out

Done in this repo:

- Products, carts, checkout, orders, coupons, and the report.
- Tests for stock races, retries, coupons, payment failure, and the report.
- `PATCH /admin/products/:productId` to change a price or a stock number.

Left out:

- Login. Routes under `/admin` are admin because of the path. The brief does not require accounts.
- A database. The data is the Maps in `src/store.ts`.
- Deleting idempotency keys after a successful checkout. They stay until the process restarts.
- A real payment company. `charge()` waits and approves. There is no timeout case where you cannot tell if the money moved.

## More than one server

There is no database in this repo. `reserve()` checks the stock and takes it before any other request on this process can run, because `reserve()` has no `await`.

A second server would not see those Maps. It could pass the same stock check. The same three writes would have to be one database update each: subtract the stock only when enough is left, set the coupon to `reserved` only when it is `available`, and set the cart to `checking_out` only when it is `open`. If the update changes no row, someone else already took it. Payment is still the slow call after that. A later update either saves the order or gives the stock and coupon back.

## AI

I wrote a build guide first: the shape of the app, and the order to build it. Then I used AI on each step to write some of the handlers. I told it the exact behavior I wanted, and I read that step before committing it.

1. Project setup: Express, TypeScript, Vitest.
2. In-memory product store and seed data.
3. `GET /products` and admin price/stock edit.
4. Cart routes and the error format.
5. Coupon generation from order milestones.
6. Checkout, order snapshots, and the idempotency key.
7. Payment: reserve, then pay, then confirm or release.
8. Admin report.

## Two more hours

1. Payment timeouts, where it is unclear whether the charge went through.
2. Swap the Maps for SQLite and run these same tests against it.
3. Expire old idempotency keys.
