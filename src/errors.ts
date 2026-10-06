import type { ErrorRequestHandler, RequestHandler } from "express";

/** Every error code the API can return, and its HTTP status. */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,

  NOT_FOUND: 404,
  CART_NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ITEM_NOT_IN_CART: 404,

  CART_ALREADY_CHECKED_OUT: 409,
  CHECKOUT_IN_PROGRESS: 409,
  CART_EMPTY: 409,
  INSUFFICIENT_STOCK: 409,
  COUPON_ALREADY_REDEEMED: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  NO_ELIGIBLE_MILESTONE: 409,

  COUPON_INVALID: 422,

  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.status = ERROR_STATUS[code];
  }
}

export const notFoundRoute: RequestHandler = (req, _res, next) => {
  next(new AppError("NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({
        error: { code: err.code, message: err.message, details: err.details },
      });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res
      .status(400)
      .json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Body is not valid JSON",
          details: {},
        },
      });
    return;
  }
  console.error(err);
  res
    .status(500)
    .json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error",
        details: {},
      },
    });
};
