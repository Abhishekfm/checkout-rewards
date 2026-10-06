import { describe, expect, it } from "vitest";
import { api, useServer } from "./helpers.js";

useServer();

describe("coupons", () => {
  it("returns 409 when no order milestone has been reached", async () => {
    const res = await api("POST", "/admin/coupons");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_ELIGIBLE_MILESTONE");
  });
});
