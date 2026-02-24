/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const now = new Date();
const pad2 = (value: number) => String(value).padStart(2, '0');
const buildNumber = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
const packageJsonRaw = readFileSync(new URL('./package.json', import.meta.url), 'utf-8');
const packageJson = JSON.parse(packageJsonRaw) as { version?: string };
const appVersion = packageJson.version || process.env.npm_package_version || '0.0.0';

// https://vite.dev/config/
export default defineConfig({
  base: '/litebistudio/',
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  define: {
    '__APP_VERSION__': JSON.stringify(appVersion),
    '__BUILD_NUMBER__': JSON.stringify(buildNumber),
    '__BUILD_DATE__': JSON.stringify(now.toLocaleString('de-DE', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })),
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-icons': ['lucide-react'],
          'vendor-ui': ['clsx', 'tailwind-merge'],
          'vendor-db': ['@sqlite.org/sqlite-wasm'],
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
