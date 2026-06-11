import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // raíz del subdominio (app.blokkit.cl); el router sigue BASE_URL
  base: "/",
  plugins: [react()]
});
