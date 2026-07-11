import { defineConfig } from 'vite'

import { foldkitAliases } from '../../examples/vite.aliases'

const variant = process.env['BUILD_VARIANT'] ?? 'naive'

const resolveOutDir = (variant: string): string => {
  if (variant === 'finegrained') {
    return 'dist/finegrained'
  }
  if (variant === 'optimised') {
    return 'dist/optimised'
  }
  return 'dist/naive'
}

const resolveEntryHtml = (variant: string): string => {
  if (variant === 'finegrained') {
    return 'index.finegrained.html'
  }
  if (variant === 'optimised') {
    return 'index.optimised.html'
  }
  return 'index.html'
}

export default defineConfig({
  base: './',
  resolve: {
    alias: foldkitAliases(__dirname),
  },
  build: {
    outDir: resolveOutDir(variant),
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: resolveEntryHtml(variant),
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
