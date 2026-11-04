import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "extensions/**/*.test.ts",
      "provider/**/*.test.ts",
      "durable/**/*.test.ts",
    ],
  },
});
