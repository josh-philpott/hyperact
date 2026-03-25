import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [tailwindcss(), react(), cloudflare()],
  server: {
    allowedHosts: ["4902-174-63-79-144.ngrok-free.app", "6054-174-63-79-144.ngrok-free.app"],
  },
})