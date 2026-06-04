import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Separamos vendors pesados en chunks propios: mejor caching entre
        // deploys y, combinado con el lazy-load de ReportView, Nivo/markdown
        // solo se descargan al abrir un informe (no en la Landing).
        manualChunks: {
          nivo: ['@nivo/bar', '@nivo/line', '@nivo/pie', '@nivo/core'],
          markdown: ['react-markdown', 'remark-gfm'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
