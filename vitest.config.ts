import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      PORT: "3002",
      DATABASE_URL:
        // Os testes usam repositórios fake e não abrem conexão.
        // Este valor existe só para satisfazer a validação de env.
        "postgresql://user:password@localhost:5432/test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/config/**",
        "src/**/*.test.ts",
        "src/**/types/**",
        // Repositório Postgres é exercitado por testes de integração com banco real,
        // fora do escopo dos testes unitários (I/O).
        "**/pg-*.repository.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
