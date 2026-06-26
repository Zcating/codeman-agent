#!/usr/bin/env node
/**
 * precommit-rust — runs on `git commit` for any staged `*.rs` files,
 * dispatched by `vite.config.ts::staged` glob `*.rs`. Mirrors the
 * frontend `precommit.mjs` design (per ADR-0021):
 *
 *   1. cargo clippy --all-targets -- -D warnings
 *      Static check + lint; warnings become errors.
 *   2. cargo test
 *      Run all 61 tests (Rust has no `--related` equivalent; full run is
 *      the only practical filter for cargo).
 *   3. cargo llvm-cov --json --output-path src-tauri/coverage.json
 *      Produce a JSON coverage report (no threshold check here — see #4).
 *   4. node scripts/check-rust-coverage.mjs <staged>
 *      Per-file ≥ 90% lines threshold on staged src/*.rs files only.
 *
 * Why a separate script (vs. extending precommit.mjs):
 *   - vite.config.ts `staged` glob already dispatches by file TYPE; this
 *     script only runs when `*.rs` is staged, and receives only `.rs`
 *     files as args (no extension detection inside).
 *   - Single-purpose scripts are easier to maintain and reason about.
 *
 * Why full `cargo test` (no filter):
 *   - cargo has no `--related` equivalent to vitest's import-graph walker.
 *   - `cargo test <name>` filters by TEST NAME, not source file.
 *   - Incremental compilation keeps subsequent runs fast (~5-10s when
 *     target/ is warm).
 *
 * Why per-file threshold via JSON parsing (not `--fail-under-lines`):
 *   - cargo-llvm-cov's `--fail-under-lines N` is AGGREGATE only. Per-file
 *     requires JSON parsing + script (mirrors the frontend perFile gate).
 *
 * Args (consumed, all are *.rs paths):
 *   - paths to staged Rust files (production source + tests + examples).
 *     `scripts/check-rust-coverage.mjs` filters to src/*.rs itself.
 *
 * Usage (automatic): invoked by `.vite-hooks/pre-commit` -> `vp staged`.
 * Usage (manual):    `node scripts/precommit-rust.mjs <files...>`
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

const staged = process.argv.slice(2);
// All args are *.rs (per vite.config.ts staged glob). No extension check.

if (staged.length === 0) {
    // Defensive: glob matched zero files but the hook fired (shouldn't
    // happen with `*.rs`). Skip silently.
    console.log("[precommit-rust] no staged .rs files; nothing to do");
    process.exit(0);
}

console.log(
    `[precommit-rust] step 1/4: vp run tauri:lint ` +
        `(cargo clippy --all-targets -- -D warnings)`,
);
execFileSync("vp", ["run", "tauri:lint"], { stdio: "inherit", shell: false });

console.log("[precommit-rust] step 2/4: vp run tauri:test (cargo test)");
execFileSync("vp", ["run", "tauri:test"], { stdio: "inherit", shell: false });

console.log(
    "[precommit-rust] step 3/4: vp run tauri:coverage " +
        "(cargo llvm-cov --json --output-path coverage.json)",
);
execFileSync("vp", ["run", "tauri:coverage"], { stdio: "inherit", shell: false });

console.log(
    `[precommit-rust] step 4/4: vp run tauri:coverage:check ` +
        `(${staged.length} staged .rs file(s); per-file 90% lines)`,
);
execFileSync(
    "vp",
    ["run", "tauri:coverage:check", "--", ...staged],
    { stdio: "inherit", shell: false },
);
