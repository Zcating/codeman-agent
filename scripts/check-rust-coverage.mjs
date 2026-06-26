#!/usr/bin/env node
/**
 * check-rust-coverage — perFile ≥90% lines threshold on staged `*.rs` files.
 *
 * Reads `src-tauri/coverage.json` (produced by `vp run tauri:coverage` via
 * `cargo llvm-cov --json`) and enforces a per-file ≥90% lines coverage
 * threshold on each staged Rust source file. Tests / examples / benches
 * / generated files are excluded from the threshold check.
 *
 * Why per-file (mirrors frontend `perFile: true`):
 *   - Aggregate `--fail-under-lines 90` lets one file drop sharply if
 *     another file over-covers; per-file stops each unit independently.
 *   - Staged files only — same semantics as the frontend gate (vitest
 *     `--coverage.include` per staged source). Unchanged files are not
 *     re-validated at commit time; CI runs the full check.
 *
 * Why JSON parsing (no `--fail-under-lines`):
 *   - `cargo llvm-cov --fail-under-lines N` only checks the AGGREGATE.
 *     For per-file we must parse the JSON output and check each file.
 *
 * Usage:
 *   node scripts/check-rust-coverage.mjs <staged.rs...>
 *   # typically invoked via: vp run tauri:coverage:check -- <files>
 *
 * Exit codes:
 *   0 - all staged source files ≥ 90% lines coverage
 *   1 - one or more files below threshold, OR missing from report,
 *       OR coverage.json not found
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const THRESHOLD = 90;
const COVERAGE_FILE = path.join("src-tauri", "coverage.json");

const staged = process.argv.slice(2);
// All args are *.rs (per vite.config.ts staged glob). No extension check
// needed — the staged glob already filtered by type.

// Filter to source files: production code under src-tauri/src/.
// Exclude tests / examples / benches / target (build artifacts).
// Note: vp-staged passes paths relative to repo root, so backend source
// paths look like "src-tauri/src/<...>.rs".
const SOURCE_RE = /^src-tauri\/src\//;
const TEST_RE = /^src-tauri\/(tests?|examples?|benches?)\//;
const TARGET_RE = /^src-tauri\/target\//;

const sourceFiles = staged.filter(
    (f) => SOURCE_RE.test(f) && !TEST_RE.test(f) && !TARGET_RE.test(f),
);

if (sourceFiles.length === 0) {
    // No production source files staged (only tests / examples / config).
    // The cargo test step already validated them; nothing perFile to check.
    console.log(
        "[check-rust-coverage] no staged src/*.rs files; skipping perFile check",
    );
    process.exit(0);
}

if (!fs.existsSync(COVERAGE_FILE)) {
    console.error(
        `[check-rust-coverage] ${COVERAGE_FILE} not found. ` +
            `Run 'vp run tauri:coverage' first.`,
    );
    process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, "utf-8"));
// cargo-llvm-cov JSON structure:
//   { data: [ { files: [ { filename, summary: { lines: { percent } } } ] } ] }
const allFiles = coverage.data?.[0]?.files ?? [];
// Build absolute-path → file map; cargo-llvm-cov uses absolute paths with
// backslashes on Windows. Normalise to forward slashes for comparison.
const filesByPath = new Map(
    allFiles.map((f) => [f.filename.replace(/\\/g, "/"), f]),
);

const failed = [];
const missing = [];

for (const stagedFile of sourceFiles) {
    // vp-staged passes paths relative to repo root, forward slashes
    // (per vp convention). Match against absolute paths from cargo-llvm-cov
    // by checking the suffix.
    const normalised = stagedFile.replace(/\\/g, "/");
    let fileData = filesByPath.get(normalised);
    if (!fileData) {
        // Try suffix match (in case path conventions differ)
        for (const [absPath, data] of filesByPath) {
            if (absPath.endsWith(normalised)) {
                fileData = data;
                break;
            }
        }
    }
    if (!fileData) {
        missing.push(stagedFile);
        continue;
    }
    const linesPct = fileData.summary?.lines?.percent ?? 0;
    if (linesPct < THRESHOLD) {
        failed.push({ file: stagedFile, linesPct, count: fileData.summary.lines.count, covered: fileData.summary.lines.covered });
    }
}

if (failed.length === 0 && missing.length === 0) {
    console.log(
        `[check-rust-coverage] OK: all ${sourceFiles.length} staged source file(s) ≥ ${THRESHOLD}% lines`,
    );
    process.exit(0);
}

if (missing.length > 0) {
    console.error(
        `[check-rust-coverage] FAILED: ${missing.length} staged source file(s) ` +
            `not in coverage report (no test exercises them):`,
    );
    for (const f of missing) {
        console.error(`  ${f}`);
    }
}
if (failed.length > 0) {
    console.error(
        `[check-rust-coverage] FAILED: ${failed.length} staged source file(s) ` +
            `below ${THRESHOLD}% lines threshold:`,
    );
    for (const { file, linesPct, count, covered } of failed) {
        console.error(
            `  ${file}: ${linesPct.toFixed(2)}% (${covered}/${count} lines)`,
        );
    }
}
console.error(
    `\n[check-rust-coverage] Add tests for missing/low-coverage files or ` +
        `raise threshold tolerance if intentional.`,
);
process.exit(1);
