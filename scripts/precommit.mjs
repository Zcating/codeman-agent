#!/usr/bin/env node
/**
 * precommit — runs on `git commit` via `vp staged` (vite-plus).
 *
 * Why a wrapper, not a one-liner in vite.config.ts:
 *   - `vp staged` appends staged file paths as positional args to the staged
 *     command. `vp run typecheck` (`tsc --noEmit`) treats extra args as files
 *     to typecheck, which drops the project tsconfig context and produces a
 *     storm of false-positive resolution errors. The wrapper consumes the
 *     arg list itself, so the inner `vp run typecheck` is invoked with NO
 *     trailing paths and always runs a full-project check.
 *   - The test step also needs arg control. `vitest --run <file>` only runs
 *     the given test file; `vitest --related <file>` (vitest 3+) walks the
 *     import graph to find every test that touches a source file. This
 *     project is on vitest 2.1.x where `--related` does not exist, so we
 *     just run the full suite — the codebase is small (13 test files,
 *     ~4s) and full-coverage is the right default for a pre-commit gate.
 *
 * Behaviour:
 *   1. Always: full-project `vp run typecheck` (ignores arg list).
 *   2. Always: full `vp run test` (~4s; covers every test, including ones that
 *      mock or import the staged source, which a per-file filter would miss).
 *
 * Args (consumed, not forwarded): paths to staged files, as passed by
 * `vp staged` per the staged glob in `vite.config.ts`. The arg list is
 * accepted only because vp-staged always appends it; nothing here uses it.
 *
 * Usage (automatic): invoked by `.vite-hooks/pre-commit` -> `vp staged`.
 * Usage (manual):    `node scripts/precommit.mjs <files...>`
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

// 1. Full-project typecheck. Never pass file args — tsc would treat them as
//    the per-file input set and lose tsconfig.json context.
console.log("[precommit] vp run typecheck (full project)");
execFileSync("vp", ["run", "typecheck"], { stdio: "inherit", shell: true });

// 2. Full test suite. Stays under 5s on this codebase; runs every test
//    regardless of which files were staged.
console.log("[precommit] vp run test (full suite)");
execFileSync("vp", ["run", "test"], { stdio: "inherit", shell: true });

// Quiet the linter about unused argv — we accept it to document the
// vp-staged arg contract even though the script does not forward it.
void process.argv.slice(2);
