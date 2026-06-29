/// <reference types="vitest" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// `vite-plugin-solid` injects an `import { $$registry } from "solid-refresh"`
// in dev/test HMR mode (its babel plugin rewriter at transform time). The
// alias `solid-refresh` → `/@solid-refresh` is virtual, and vitest 4's
// module-runner hands that id to `createRequire` as `file:///@solid-refresh`
// — Node rejects the bare shape. We disable HMR only when vitest is the
// command, so unit tests run without the injected virtual import while
// `vp run tauri:dev` keeps full HMR.
const isVitest = !!process.env.VITEST;
const solidOptions = isVitest ? { hot: false } : undefined;

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solid(solidOptions), tailwindcss()],
  // `vp staged` runs on `git commit` (see `.vite-hooks/pre-commit`, installed
  // by `vp config`). Each glob pattern dispatches to a dedicated script:
  //   - `*.{ts,tsx,mjs}` -> scripts/precommit.mjs (frontend gate: typecheck +
  //     vitest related <staged> + --coverage.include per staged source +
  //     perFile 90% statements threshold)
  //   - `*.rs` -> scripts/precommit-rust.mjs (backend gate: cargo clippy
  //     --all-targets -- -D warnings + cargo test + cargo llvm-cov +
  //     perFile 90% lines threshold on staged sources)
  //
  // The file TYPE is already determined by the glob match, so each script
  // receives ONLY files of its own type and doesn't need to filter by
  // extension (e.g., precommit.mjs assumes all args are .ts/.tsx/.mjs,
  // precommit-rust.mjs assumes all args are .rs). This avoids redundant
  // type checks and keeps each script single-purpose. See ADR-0021 for
  // the precommit gate architecture.
  staged: {
    "*.{ts,tsx,mjs}": "node scripts/precommit.mjs",
    "*.rs": "node scripts/precommit-rust.mjs",
  },
  resolve: {
    conditions: ["browser", "development"],
    alias: [
      {
        find: /^solid-js$/,
        replacement: resolve(__dirname, "node_modules/solid-js/dist/dev.js"),
      },
      {
        find: "solid-js/web",
        replacement: resolve(__dirname, "node_modules/solid-js/web/dist/web.js"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
    // E2E specs in /e2e are run by Playwright, not vitest. The patterns
    // below keep vitest focused on the unit-test surface under /src.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "e2e", "playwright-report"],
    server: {
      deps: {
        inline: [/solid-js/, /solidjs/],
      },
    },
    // Coverage (test:coverage). The exclude list keeps mocks, test files,
    // and mount-point entry points out of the report. The statements
    // threshold is per-file (per the 11-target goal that all core modules
    // must hit ≥90% statements). Branches / functions / lines are tracked
    // but not gated — branch coverage is noisy on typebox-driven code and
    // cast-heavy wrappers (see ADR-0020 D1 + AGENTS.md "测试"段).
    //
    // Exclude rationale:
    // - `src/**/*.test.{ts,tsx}` / `*.spec.{ts,tsx}` / `__tests__/**`
    //   — test files themselves
    // - `src/__mocks__/**` — IPC mock (per ADR-0010 single-source); not
    //   production code
    // - `*.test-d.ts` — typecheck-only fixtures (tsd-style); no runtime
    // - `src/index.tsx` / `src/router.tsx` — mount / router config; e2e
    //   coverage via Playwright (per `src/AGENTS.md` "测试"段)
    // - `src/features/<feature>/routes/index.tsx` — route components
    //   wired by `src/router.tsx`; e2e coverage
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/**/*.test-d.ts",
        "src/**/__tests__/**",
        "src/__mocks__/**",
        "src/index.tsx",
        "src/router.tsx",
        "src/features/**/routes/index.tsx",
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 90,
        perFile: true,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    // Bind explicitly to IPv4 loopback. The e2e globalSetup connects to
    // `127.0.0.1` (see playwright.config.ts::use.baseURL) — and Node's DNS
    // resolver on this host prefers `::1` for `localhost`, so we can't
    // rely on the system default. `host: false` (the previous value) is
    // equivalent to `'localhost'` on most setups, but the actual bind
    // address is system-dependent and breaks e2e.
    host: host || "127.0.0.1",
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
