import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mts'
import path from 'node:path'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: path.resolve(__dirname, './src/renderer/test/setup.ts'),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/renderer/**/*.tsx', 'src/renderer/**/*.ts'],
      exclude: ['src/renderer/main.tsx', 'src/renderer/vite-env.d.ts', 'src/renderer/test/**']
    }
  }
}))
