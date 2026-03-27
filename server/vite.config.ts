import { defineConfig } from 'vite';
import { createProxyMiddleware } from 'http-proxy-middleware';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: isProduction,
      },
    },
  },
});
