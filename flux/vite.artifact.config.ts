import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Version « un seul fichier » : tout le code dans un seul script, pour l'artefact.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-artifact',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
