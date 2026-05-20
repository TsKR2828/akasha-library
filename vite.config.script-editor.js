import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "modules/script-editor",
  base: "./",
  build: {
    outDir: "../../dist/script-editor",
    emptyOutDir: true,
  },
});
