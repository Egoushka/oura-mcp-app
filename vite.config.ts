import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// The host fetches ONE html resource, so everything must be inlined.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    rollupOptions: { input: process.env.INPUT ?? "mcp-app.html" },
    outDir: "dist",
    emptyOutDir: false,
  },
})
