import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = 'http://127.0.0.1:3000';

const proxyPaths = [
  '/runs',
  '/capabilities',
  '/settings',
  '/conversations',
  '/models',
  '/health',
  '/openapi.json',
  '/docs',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxyPaths.map((path) => [path, { target: API_TARGET, changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
  },
});
