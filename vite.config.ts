import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Gelato ERP',
          short_name: 'Gelato ERP',
          description: 'Inventory and Point of Sale Management',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#4f46e5',
          orientation: 'portrait-primary',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'maskable any' },
          ],
        },
        workbox: {
          importScripts: ['/push-sw.js'],
          // Cache the app shell (HTML, JS, CSS, fonts, images) for offline use
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Network-first for Supabase API: try network, fall back to cache
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 }, // 1 hour
                networkTimeoutSeconds: 10,
              },
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
