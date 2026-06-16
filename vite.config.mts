import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import pkg from './package.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererOnly = process.env.QUORUM_RENDERER_ONLY === '1'

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  root: 'src/renderer',
  server: {
    port: 5174,
  },
  cacheDir: rendererOnly ? '../../node_modules/.vite-renderer' : 'node_modules/.vite',
  publicDir: 'public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  define: {
    'APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    !rendererOnly && electron([
      {
        // Main-Process entry file of the Electron App.
        entry: path.resolve(__dirname, 'src/main/electron/main.ts'),
        onstart(options) {
          // Explicitly start Electron and point it to the project root
          options.startup()
        },
        vite: { 
          build: { 
            outDir: '../../dist-electron',
            rollupOptions: { 
              external: ["better-sqlite3"] 
            } 
          } 
        },
      },
      {
        entry: path.resolve(__dirname, 'src/main/electron/preload.ts'),
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: '../../dist-electron',
          }
        }
      },
    ]),
    !rendererOnly && renderer({ resolve: { "better-sqlite3": { type: "cjs" } } }),
  ].filter(Boolean),
})
