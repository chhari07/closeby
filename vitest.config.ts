import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" path so app modules (e.g. nearby-shops.ts
    // importing "@/lib/firebase/admin") resolve the same way here as they do
    // for Next.js itself.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
