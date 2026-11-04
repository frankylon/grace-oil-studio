import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
// PREVIEW=1 时打包成单一 HTML（给 Claude 预览用）
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(process.env.PREVIEW ? [viteSingleFile()] : [])],
  base: process.env.PREVIEW ? "./" : "/",
  build: process.env.PREVIEW ? { outDir: "dist-preview", assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 } : { chunkSizeWarningLimit: 2000 },
}));
