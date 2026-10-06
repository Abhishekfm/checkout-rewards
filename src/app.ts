import express, { type ErrorRequestHandler } from "express";
import {
  listProducts,
  ProductRequestError,
  updateProduct,
} from "./products.js";

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

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ProductRequestError) {
    res.status(err.status).json({ error: { message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: "Unexpected server error" } });
};

app.use(errorHandler);
