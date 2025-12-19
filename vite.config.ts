import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Use the ES module version of rhino3dm for better Vite compatibility
      "rhino3dm": path.resolve(__dirname, "./node_modules/rhino3dm/rhino3dm.module.js"),
    },
  },
  optimizeDeps: {
    // Exclude rhino3dm from pre-bundling as it has WASM
    exclude: ["rhino3dm"],
  },
  build: {
    rollupOptions: {
      // Mark 'ws' as external since rhino3dm only needs it server-side
      external: ["ws"],
    },
  },
}));
