import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false,
  clean: true,
  target: "node18",
  minify: false,
  sourcemap: true,
  splitting: false,
  outDir: "dist",
});
