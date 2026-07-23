#!/usr/bin/env node
/**
 * prepare-effect — ensure `.repos/effect` (the vendored Effect-TS source for
 * the effect-ts skill) is cloned locally. Idempotent: no-op when already
 * present, clones shallow from the upstream repo otherwise.
 *
 * Wired via the `prepare` npm script so `pnpm install` bootstraps the
 * checkout automatically. Exits 0 in both branches so it never blocks
 * installation.
 *
 * Source: https://github.com/Effect-TS/effect-smol
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import process from "node:process";

const repoDir = ".repos/effect";
const repoUrl = "https://github.com/Effect-TS/effect-smol";

if (existsSync(`${repoDir}/.git`)) {
  process.exit(0);
}

mkdirSync(".repos", { recursive: true });

const result = spawnSync("git", ["clone", "--depth", "1", repoUrl, repoDir], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
