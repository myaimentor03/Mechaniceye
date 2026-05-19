import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5000"
    }
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  }
});
