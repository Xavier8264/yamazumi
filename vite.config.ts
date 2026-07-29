import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

// The app is built into dist/yamazumi/ so that the files sit at the same paths
// the bundle asks for (base is '/yamazumi/'). Cloudflare Pages then serves
// dist/ as the project root and no path rewriting is needed anywhere.
//
// Pages only reads _redirects from the root of the deployed directory, which is
// one level above outDir, so it cannot come from public/ and is written here.
// The rule is the SPA fallback: /yamazumi/animate has no file behind it, and
// existing files still win over the rewrite.
const REDIRECTS = '/yamazumi/* /yamazumi/index.html 200\n';

function pagesRedirects(): Plugin {
  let outDir = '';
  return {
    name: 'pages-redirects',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      writeFileSync(resolve(outDir, '..', '_redirects'), REDIRECTS);
    },
  };
}

export default defineConfig({
  base: '/yamazumi/',
  build: {
    outDir: 'dist/yamazumi',
  },
  plugins: [react(), pagesRedirects()],
  optimizeDeps: {
    include: ['mediabunny'],
  },
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
