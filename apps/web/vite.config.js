import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:8787';
const supabaseProxyTarget = process.env.VITE_DEV_SUPABASE_PROXY_TARGET ?? 'http://127.0.0.1:54321';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
      '/healthz': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
      '/readyz': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
      '/storage': {
        target: supabaseProxyTarget,
        changeOrigin: false,
      },
    },
  },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
  },
});
