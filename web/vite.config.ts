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
    rollupOptions: {
      output: {
        // The libraries in a file of their own: they change far less often than
        // the shop's code, so a returning visitor's browser keeps them across
        // deploys and fetches only what changed.
        manualChunks(id) {
          if (/node_modules[\/](react|react-dom|scheduler|@radix-ui|embla-carousel[^\/]*|sonner|tailwind-merge|clsx|class-variance-authority|react-remove-scroll[^\/]*|tslib|use-callback-ref|use-sidecar|aria-hidden|get-nonce|detect-node-es)[\/]/.test(id)) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // During `npm run dev`, forward API calls and admin-uploaded product
    // images to the Node backend — both are served from src/public/ at
    // runtime, which only the backend (not Vite's dev server) can see.
    // API_TARGET points them elsewhere (a preview relay to the live shop, say).
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: process.env.API_TARGET || 'http://localhost:3000', changeOrigin: true },
      '/images': { target: process.env.API_TARGET || 'http://localhost:3000', changeOrigin: true },
    },
  },
});
