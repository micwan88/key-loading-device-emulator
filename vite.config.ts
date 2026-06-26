/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

// Base path for GitHub Pages project site: https://<user>.github.io/<repo>/
export default defineConfig({
  base: "/key-loading-device-emulator/",
  plugins: [tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.ts"],
  },
});
