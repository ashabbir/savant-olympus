import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  cacheDir: 'node_modules/.vite-electron',
  build: {
    emptyOutDir: true,
    outDir: 'dist-electron',
    minify: false,
    lib: {
      entry: {
        main: path.resolve(__dirname, 'src/main/electron/main.ts'),
        preload: path.resolve(__dirname, 'src/main/electron/preload.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        'electron',
        'better-sqlite3',
        'node:child_process',
        'node:fs/promises',
        'node:os',
        'node:path',
      ],
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
