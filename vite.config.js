import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "modules/spreadsheet",
  base: "./",
  build: {
    outDir: "../../dist/spreadsheet",
    emptyOutDir: true,
  },
});
