import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative assets work both at username.github.io and under /repository/.
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
});
