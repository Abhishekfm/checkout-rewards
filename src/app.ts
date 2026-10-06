import express from "express";
import {
  addItem,
  cartView,
  createCart,
  getCart,
  removeItem,
  setItemQuantity,
} from "./cart.js";
import { checkout, getOrder, orderView } from "./checkout.js";
import { generateCoupon, listCoupons } from "./coupons.js";
import { errorHandler, notFoundRoute } from "./errors.js";
import { listProducts, updateProduct } from "./products.js";
import { buildReport } from "./report.js";

export const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/products", (_req, res) => {
  res.json({ products: listProducts() });
});

app.patch("/admin/products/:productId", (req, res) => {
  res.json(updateProduct(req.params.productId, req.body ?? {}));
});

app.post("/carts", (_req, res) => {
  res.status(201).json(cartView(createCart()));
});

app.get("/carts/:cartId", (req, res) => {
  res.json(cartView(getCart(req.params.cartId)));
});

app.post("/carts/:cartId/items", (req, res) => {
  const { productId, quantity } = req.body ?? {};
  res.json(cartView(addItem(req.params.cartId, productId, quantity)));
});

app.patch("/carts/:cartId/items/:productId", (req, res) => {
  const { quantity } = req.body ?? {};
  res.json(
    cartView(setItemQuantity(req.params.cartId, req.params.productId, quantity))
  );
});

app.delete("/carts/:cartId/items/:productId", (req, res) => {
  res.json(cartView(removeItem(req.params.cartId, req.params.productId)));
});

app.post("/carts/:cartId/checkout", async (req, res) => {
  const { created, order } = await checkout(
    req.params.cartId,
    req.get("Idempotency-Key"),
    req.body?.couponCode
  );
  res.status(created ? 201 : 200).json(orderView(order));
});

app.get("/orders/:orderId", (req, res) => {
  res.json(orderView(getOrder(req.params.orderId)));
});

app.post("/admin/coupons", (_req, res) => {
  res.status(201).json(generateCoupon());
});

app.get("/admin/coupons", (_req, res) => {
  res.json({ coupons: listCoupons() });
});

app.get("/admin/report", (_req, res) => {
  res.json(buildReport());
});

app.use(notFoundRoute);
app.use(errorHandler);
