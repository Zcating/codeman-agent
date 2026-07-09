#!/usr/bin/env node
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
    (f) => SOURCE_RE.test(f) && !TEST_RE.test(f) && !DT_RE.test(f) && !f.includes("e2e/"),
);

if (sourceFiles.length > 0) {
    // Pass each staged source as its own --coverage.include=<file> arg. With
    // `perFile: true` threshold in vite.config.ts, each listed file is
    // checked independently.
    // const coverageIncludes = sourceFiles.map(
    //     (f) => `--coverage.include=${f}`,
    // );
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
            // "--coverage",
            // ...coverageIncludes,
        ],
        { stdio: "inherit", shell: false },
    );
} else {
    // No source files staged (config / docs / .md / .json / etc.) — fall
    // back to full coverage so the gate still runs.
    // console.log(
    //     "[precommit] vp run test:coverage (full suite, no source files staged)",
    // );
    // execFileSync("vp", ["run", "test:coverage"], { stdio: "inherit", shell: false });
}