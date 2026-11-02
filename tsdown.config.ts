import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["provider/index.ts", "durable/index.ts"],
  outDir: "dist",
  format: "esm",
  dts: true,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
