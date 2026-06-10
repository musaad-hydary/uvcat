import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-gif-worker",
      buildStart() {
        copyFileSync(
          "node_modules/gif.js/dist/gif.worker.js",
          "public/gif.worker.js",
        );
      },
    },
  ],
});
