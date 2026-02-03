import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages, set BASE_PATH to "/<repo-name>/"
// In Codespaces/Dev, it defaults to "/"
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  plugins: [react()],
  base,
});