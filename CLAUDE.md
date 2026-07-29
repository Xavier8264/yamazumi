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
