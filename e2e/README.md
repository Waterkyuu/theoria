# Browser end-to-end tests

Run the Playwright suite from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts Vite on `127.0.0.1:4173` and opens the frontend in Chromium. Place new `*.e2e.ts` tests in this directory. The skill creation test uses an in-memory Tauri IPC fixture, so it can run without a desktop process or a local skill library.

Use `pnpm test:e2e --ui` to debug interactively. CI uploads `test-results/` on failure. Open a trace with `pnpm exec playwright show-trace path/to/trace.zip`.
