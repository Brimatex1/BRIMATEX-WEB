import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Build straight into the folder the Node server already serves.
    outDir: path.resolve(__dirname, '../src/public'),
    emptyOutDir: true,
    // The server sends `script-src 'self'` — no inline scripts allowed.
    modulePreload: { polyfill: false },
    cssCodeSplit: false,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // During `npm run dev`, forward API calls and admin-uploaded product
    // images to the Node backend — both are served from src/public/ at
    // runtime, which only the backend (not Vite's dev server) can see.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
