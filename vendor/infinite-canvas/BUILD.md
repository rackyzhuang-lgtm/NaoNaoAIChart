# Infinite Canvas vendor build

This directory is a source snapshot of [`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas).
It is intentionally kept as an isolated web subproject; the desktop application's root
dependencies and build are not used to build it.

## Pinned upstream version

- Tag: `v0.15.1`
- Commit: `a2576d559ad765ba83e9563894adfbcd4e63405a`
- License: MIT (see [`LICENSE`](./LICENSE))

The snapshot includes the upstream `web/package.json` and `web/package-lock.json`.
Run commands from `vendor/infinite-canvas/web`:

```sh
npm ci --legacy-peer-deps
npm run typecheck
npm run build
```

`--legacy-peer-deps` is required by this pinned lockfile because
`@ant-design/pro-components@3.0.0-beta.3` declares an Ant Design 5 peer range while
the project pins `antd@6.4.2`. Do not merge these dependencies into the root project.

## Packaging requirements

- The Vite build emits a root-based SPA by default (`VITE_BASE=/`). If assets are
  served under another path, build with the matching `VITE_BASE` value.
- The app uses React Router's `createBrowserRouter` with `/canvas` and `/canvas/:id`
  routes. The Electron loopback server must return the built `index.html` for unknown
  application paths (SPA fallback), while returning real static files unchanged.
- Serve `.html` as `text/html`, JavaScript modules as a JavaScript MIME type, CSS as
  `text/css`, JSON as `application/json`, and media/fonts using their declared MIME
  types. Do not use `file://` loading for this BrowserRouter build.

## Embedded output

The Electron-served output is committed under `assets/infinite-canvas/`. After an
upstream rebuild, replace that directory with `web/dist/` and restore the small
`naonao-embed-bridge.js` file plus its script tag in `index.html`. The bridge only
rewrites requests for the two approved service origins to the loopback proxy; it does
not inject application credentials or expose Electron IPC to the iframe.

Windows npm needs four pinned platform packages in `devDependencies` because npm
omitted them from the upstream optional dependency graph in this environment:
`@rollup/rollup-win32-x64-msvc`, `@esbuild/win32-x64`,
`@tailwindcss/oxide-win32-x64-msvc`, and `lightningcss-win32-x64-msvc`.

## Verification status (2026-08-09)

- `npm install --package-lock-only --legacy-peer-deps`: completed and refreshed the
  independent lockfile's missing entries.
- `npm ci --legacy-peer-deps --ignore-scripts`: completed (1307 packages).
- `npm run typecheck`: **fails in upstream code** at
  `src/lib/canvas/canvas-generation-helpers.ts:51` (`node.metadata` possibly undefined).
- `npm run build`: completed after pinning the Windows platform packages above; Vite
  transformed 8,673 modules and emitted the production SPA. It retained upstream
  dynamic-import and large-chunk warnings.

The upstream typecheck failure remains recorded as a risk; no upstream business source
was rewritten in this snapshot.
