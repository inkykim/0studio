import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "localhost",
    port: 5173,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Exclude rhino3dm from pre-bundling - it's loaded from CDN via Three.js loader
    exclude: ["rhino3dm"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      // Mark rhino3dm and ws as external - rhino3dm is loaded from CDN
      external: ["rhino3dm", "ws"],
    },
  },
  // Electron specific configuration
  base: mode === 'development' ? '/' : './',
}));
