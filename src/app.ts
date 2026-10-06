import express from "express";
import {
  addItem,
  cartView,
  createCart,
  getCart,
  removeItem,
  setItemQuantity,
} from "./cart.js";
import { generateCoupon, listCoupons } from "./coupons.js";
import { errorHandler, notFoundRoute } from "./errors.js";
import { listProducts, updateProduct } from "./products.js";

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

app.post("/admin/coupons", (_req, res) => {
  res.status(201).json(generateCoupon());
});

app.get("/admin/coupons", (_req, res) => {
  res.json({ coupons: listCoupons() });
});

app.use(notFoundRoute);
app.use(errorHandler);
