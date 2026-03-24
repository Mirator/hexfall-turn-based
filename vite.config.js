import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (normalizedId.includes("node_modules/phaser")) {
            return "phaser-vendor";
          }
          if (normalizedId.includes("/src/scenes/") || normalizedId.includes("/src/systems/")) {
            return "gameplay";
          }
          return undefined;
        },
      },
    },
  },
});
