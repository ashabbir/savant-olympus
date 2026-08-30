import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mts'
import path from 'node:path'

// Force the test environment before Vite/React resolution happens. An ambient
// NODE_ENV=production in the shell otherwise makes React resolve its production
// build, and every React Testing Library test fails with
// "act(...) is not supported in production builds of React".
process.env.NODE_ENV = 'test'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    env: {
      NODE_ENV: 'test'
    },
    setupFiles: path.resolve(__dirname, './src/renderer/test/setup.ts'),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/renderer/**/*.tsx', 'src/renderer/**/*.ts'],
      exclude: ['src/renderer/main.tsx', 'src/renderer/vite-env.d.ts', 'src/renderer/test/**']
    }
  }
}))
