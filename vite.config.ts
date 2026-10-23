import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'serve'
      ? [
          {
            name: 'dev-csp',
            transformIndexHtml: (html: string) =>
              html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, ''),
          },
        ]
      : []),
  ],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
}));
