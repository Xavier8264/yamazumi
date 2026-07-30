# Yamazumi Chart Tool

Read SPEC.md in full before writing code. It is the single source of truth for this
project. If an instruction in a prompt conflicts with SPEC.md, ask before proceeding.

## Rules

- ASCII only in code, comments, and console output. Use `->`, `[OK]`, `[X]`, `[!]`.
  No Unicode arrows, checkmarks, or emoji. Non-ASCII test data is written with `\u`
  escape sequences so source files stay ASCII.
- TypeScript strict mode. Plain CSS. No component libraries.
- All chart geometry lives in the pure `layout()` function (`src/model/layout.ts`).
  It must stay free of DOM, React, canvas, and `window`. Renderers only paint.
- The CSV format (SPEC section 4) is durable. Never change it.

## Commands

- `npm run dev` - dev server, app served under `/yamazumi/`
- `npm run build` - typecheck + production build
- `npm test` - run the Vitest suite once

### Serving on the local network

- `npm run serve:lan` - build, then serve the build to the LAN on port 4173
- `npm run preview:lan` - same, reusing the existing `dist/` build
- `npm run dev:lan` - dev server on the LAN (port 5173), HMR included

Each prints a `Network:` URL per interface, e.g.
`http://192.168.1.20:4173/yamazumi/` - open that on any device on the same
network. Ignore `169.254.*` (link-local) and virtual-adapter addresses such as
Hyper-V or WSL; pick the one matching the machine's Wi-Fi or Ethernet IP.
Windows Firewall prompts for network access on the first run - allow it for
private networks. Everything still runs client-side; nothing is uploaded.
