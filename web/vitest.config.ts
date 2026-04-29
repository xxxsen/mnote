import { defineConfig } from "vitest/config";
import path from "node:path";

const COVERED_SOURCES = [
  "src/lib/**/*.ts",
  "src/components/**/*.ts",
  "src/components/**/*.tsx",
  "src/app/**/hooks/**/*.ts",
  "src/app/**/services/**/*.ts",
  "src/app/**/utils/**/*.ts",
  "src/app/**/helpers/**/*.ts",
  "src/app/**/constants.ts",
  "src/types.ts",
];

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: COVERED_SOURCES,
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.d.ts",
      ],
      thresholds: {
        statements: 92,
        branches: 78,
        functions: 92,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
