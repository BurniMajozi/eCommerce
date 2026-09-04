import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const page = (path) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      input: {
        home: page('./index.html'),
        operations: page('./operations/index.html'),
        commerce: page('./commerce/index.html'),
        tenantAdministration: page('./tenant-administration/index.html'),
        pricing: page('./pricing/index.html'),
      },
    },
  },
})
