import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The "source" condition lets Vite use the workspace packages' TypeScript directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ["source", "module", "browser", "default"] },
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
      "/health": "http://127.0.0.1:8080",
      "/api": "http://127.0.0.1:8080",
    },
  },
});
