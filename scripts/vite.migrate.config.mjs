import { defineConfig } from "vite";

// Builds scripts/migrate.ts into one self-contained file for the runtime image.
export default defineConfig({
  configFile: false,
  publicDir: false,
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "scripts/migrate.ts",
    outDir: "dist/migrate",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "migrate.mjs", format: "es" } },
  },
});
