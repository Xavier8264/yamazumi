import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  base: '/yamazumi/',
  plugins: [react()],
  resolve: {
    alias: {
      // jsPDF's optional DOM-rasterization deps; see src/shims/empty.ts.
      html2canvas: '/src/shims/empty.ts',
      canvg: '/src/shims/empty.ts',
      dompurify: '/src/shims/empty.ts',
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          testTimeout: 120000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
