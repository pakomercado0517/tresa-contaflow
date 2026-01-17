import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "src/index.ts",
        "src/database/config.ts",
        "src/database/config.cjs",
      ],
    },
    testTimeout: 30000,
    pool: "forks",
    // Ejecutar tests de forma secuencial para evitar conflictos de BD
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    // @ts-expect-error - poolOptions may not be in type definitions but is supported by Vitest
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
