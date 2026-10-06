import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    env: { PAYMENT_DELAY_MS: "10" },
  },
});
