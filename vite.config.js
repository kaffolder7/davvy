import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

const vitePort = Number(process.env.VITE_PORT ?? 5173);
const ddevPrimaryUrl = process.env.DDEV_PRIMARY_URL?.replace(/\/$/, '');
const ddevHost = ddevPrimaryUrl ? new URL(ddevPrimaryUrl).hostname : undefined;

export default defineConfig(({ mode }) => {
  const isVitest = mode === 'test' || process.env.VITEST === 'true';

  return {
    plugins: [
      ...(!isVitest
        ? [
            laravel({
              input: ['resources/css/app.css', 'resources/js/app.jsx'],
              refresh: true,
            }),
          ]
        : []),
      react(),
    ],
    server: {
      host: '0.0.0.0',
      port: vitePort,
      strictPort: true,
      ...(ddevPrimaryUrl
        ? {
            origin: `${ddevPrimaryUrl}:${vitePort}`,
            cors: {
              origin: ddevPrimaryUrl,
              credentials: true,
            },
            hmr: {
              host: ddevHost,
              protocol: 'wss',
              port: vitePort,
            },
          }
        : {}),
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./resources/js/test/setupTests.js'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-router-dom')) {
              return 'router';
            }

            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom')
            ) {
              return 'react-vendor';
            }

            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
