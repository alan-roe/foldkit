import { defineConfig } from 'vite'

import { foldkitAliases } from '../../examples/vite.aliases'

export default defineConfig({
  base: './',
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    fs: {
      allow: ['../../'],
    },
  },
})
