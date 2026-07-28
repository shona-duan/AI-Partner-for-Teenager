import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/chat": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/upload": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/plan": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/tools": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
