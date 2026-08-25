import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
