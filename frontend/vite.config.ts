import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy inspect to Cartesi node (v2 advancer port 10012) to avoid CORS. Use VITE_INSPECT_URL=/inspect-api in .env.
      "/inspect-api": {
        target: "http://localhost:10012",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/inspect-api/, ""),
      },
    },
  },
})
