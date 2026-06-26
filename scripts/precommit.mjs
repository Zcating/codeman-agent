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
 *   - The test step passes staged paths to `vitest related <files>` so test
 *     execution walks only the import graph of changed files (fast: ~2-5s
 *     for small changes, ~30s for changes that import the whole project).
 *     One `--coverage.include=<file>` per staged source narrows the
 *     coverage report AND the perFile 90% threshold to those files only.
 *
 * Why this design (A, vs. "run full coverage every commit"):
 *   - Full `vp run test:coverage` is ~37s × every commit. Filtered gives
 *     ~2-5s for typical small changes, with the same perFile threshold
 *     enforcement on the changed files.
 *   - vitest's `related` walks the import graph for test EXECUTION, and
 *     `--coverage.include` (one path per arg) scopes the coverage REPORT.
 *     The `perFile: true` threshold in vite.config.ts then checks each
 *     staged file independently — a file that drops from 95% to 85% fails
 *     the gate even if its siblings are still at 100%.
 *
 * Why `shell: false` for the inner `execFileSync`:
 *   - `shell: true` on Windows uses cmd.exe, which mangles brace patterns
 *     and quote handling for `--coverage.include={a,b,c}`. Direct exec with
 *     `shell: false` passes each `--coverage.include=<file>` arg verbatim,
 *     and `vp` resolves `vp` via PATH lookup just like `shell: true` does.
 *
 * Behaviour:
 *   1. Always: full-project `vp run typecheck` (ignores arg list).
 *   2. If any staged file is a source (.ts/.tsx not test/spec):
 *      `vitest related <staged> --coverage --coverage.include=<src1> ...`
 *      — filtered test execution + filtered coverage + perFile 90% gate.
 *   3. Otherwise (config / docs / markdown only): fall back to
 *      `vp run test:coverage` (full suite) so the gate still produces a
 *      result and catches any unrelated regression.
 *
 * Args (consumed, forwarded selectively): paths to staged files, as passed
 * by `vp staged` per the staged glob in `vite.config.ts`.
 *
 * Usage (automatic): invoked by `.vite-hooks/pre-commit` -> `vp staged`.
 * Usage (manual):    `node scripts/precommit.mjs <files...>`
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

// vp-staged arg list = paths to staged files (per vite.config.ts staged glob).
const staged = process.argv.slice(2);

// 1. Full-project typecheck. Never pass file args — tsc would treat them as
//    the per-file input set and lose tsconfig.json context.
console.log("[precommit] vp run typecheck (full project)");
execFileSync("vp", ["run", "typecheck"], { stdio: "inherit", shell: false });

// 2. Filtered test + coverage gate. Partition staged files into sources
//    (covered by perFile 90% gate) and tests / config (only used to filter
//    test execution via `related`). Skip `.d.ts` files — they're type-only
//    declarations with no runtime code, would show 0% in the report and
//    pollute the threshold check.
const SOURCE_RE = /\.(ts|tsx)$/;
const TEST_RE = /\.(test|spec)\.(ts|tsx)$/;
const DT_RE = /\.d\.ts$/;
const sourceFiles = staged.filter(
    (f) => SOURCE_RE.test(f) && !TEST_RE.test(f) && !DT_RE.test(f),
);

if (sourceFiles.length > 0) {
    // Pass each staged source as its own --coverage.include=<file> arg. With
    // `perFile: true` threshold in vite.config.ts, each listed file is
    // checked independently.
    const coverageIncludes = sourceFiles.map(
        (f) => `--coverage.include=${f}`,
    );
    console.log(
        `[precommit] vp run test:web (related: ${staged.length} file(s); ` +
            `coverage on ${sourceFiles.length} source(s))`,
    );
    execFileSync(
        "vp",
        [
            "run",
            "test:web",
            "related",
            ...staged,
            "--coverage",
            ...coverageIncludes,
        ],
        { stdio: "inherit", shell: false },
    );
} else {
    // No source files staged (config / docs / .md / .json / etc.) — fall
    // back to full coverage so the gate still runs.
    console.log(
        "[precommit] vp run test:coverage (full suite, no source files staged)",
    );
    execFileSync("vp", ["run", "test:coverage"], { stdio: "inherit", shell: false });
}