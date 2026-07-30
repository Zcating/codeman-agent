











import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const indexCssPath = resolve(here, "./index.css");
const indexCssRaw = readFileSync(indexCssPath, "utf8");

describe("index.css @layer base — span cursor default", () => {
  it("declares span { cursor: default } inside @layer base (per user 2026-07-26)", () => {
    
    
    expect(indexCssRaw).toMatch(
      /@layer\s+base\s*\{[\s\S]*?\bspan\s*\{[^}]*cursor:\s*default[^}]*\}[\s\S]*?\}/,
    );
  });

  it("the span cursor rule lives inside @layer base (not at top level)", () => {
    
    const baseMatch = indexCssRaw.match(/@layer\s+base\s*\{[\s\S]*?\n\}/);
    expect(baseMatch).toBeTruthy();
    expect(baseMatch![0]).toMatch(/\bspan\s*\{[^}]*cursor:\s*default[^}]*\}/);
  });
});
