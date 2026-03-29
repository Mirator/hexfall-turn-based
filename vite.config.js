import { defineConfig } from "vite";

function normalizeModuleId(id) {
  return id.replaceAll("\\", "/");
}

function isPhaserModule(id) {
  const normalizedId = normalizeModuleId(id);
  return (
    normalizedId.includes("/node_modules/phaser/") ||
    normalizedId.includes("/.vite/deps/phaser") ||
    normalizedId === "phaser" ||
    normalizedId.startsWith("phaser/")
  );
}

function isGameplayModule(id) {
  const normalizedId = normalizeModuleId(id);
  return normalizedId.includes("/src/scenes/") || normalizedId.includes("/src/systems/");
}

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "phaser-vendor",
              test: isPhaserModule,
              priority: 100,
            },
            {
              name: "gameplay",
              test: isGameplayModule,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
