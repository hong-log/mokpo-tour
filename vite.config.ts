import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES || process.env.GITHUB_ACTIONS ? "/mokpo-tour/" : "/",
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 4177,
  },
});
