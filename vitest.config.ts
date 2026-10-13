import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./"),
      // The real package throws outside a server build. Tests only need the import to resolve.
      "server-only": here("./tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
