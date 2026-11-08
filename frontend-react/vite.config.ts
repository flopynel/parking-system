import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Pure client-side SPA build: outputs static dist/ (index.html + assets/) for Apache/cPanel.
export default defineConfig({
  // Relative asset paths so the build works from any subfolder on the host.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
