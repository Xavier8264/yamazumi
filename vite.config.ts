import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const EMPTY_SHIM = fileURLToPath(new URL('./src/shims/empty.ts', import.meta.url));

// Local-network serving: the `:lan` scripts in package.json pass --host, which
// binds the server to every interface instead of localhost only, so other
// machines on the same network can open the app. Vite rejects requests whose
// Host header is a name it does not know about; raw LAN IPs are always allowed,
// so this only has to cover the mDNS names Windows and macOS advertise, e.g.
// http://desktop.local:4173/yamazumi/. A leading dot also matches subdomains.
const LAN_ALLOWED_HOSTS = ['.local'];

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
  server: {
    allowedHosts: LAN_ALLOWED_HOSTS,
  },
  preview: {
    // A LAN preview URL gets handed to other people, so it must not quietly
    // move to another port when 4173 is busy - fail loudly instead.
    port: 4173,
    strictPort: true,
    allowedHosts: LAN_ALLOWED_HOSTS,
  },
  optimizeDeps: {
    // react-dom/client is here for the browser tests only: they mount a real
    // component to check the CSS against the canvas renderer, and a dep
    // optimized mid-run reloads the page under the test.
    include: ['mediabunny', 'react-dom/client'],
  },
  resolve: {
    alias: {
      // jsPDF's optional DOM-rasterization deps; see src/shims/empty.ts.
      // Absolute: the dep optimizer resolves aliases relative to the module
      // being rewritten, so a root-relative '/src/...' becomes
      // 'node_modules/../src/...' and fails to load.
      html2canvas: EMPTY_SHIM,
      canvg: EMPTY_SHIM,
      dompurify: EMPTY_SHIM,
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
