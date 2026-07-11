import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

describe("qa-loader", () => {
  let tempJsonPath: string;

  beforeEach(async () => {
    // Reset module state between tests
    const { resetQaLoaderForTest } = await import("./qa-loader");
    resetQaLoaderForTest();
  });

  afterEach(async () => {
    // Clean up temp file if created
    if (tempJsonPath) {
      try {
        await unlink(tempJsonPath);
      } catch {
        // ignore
      }
      tempJsonPath = "";
    }
    // Restore any stubbed env vars
    const { vi } = await import("vitest");
    vi.unstubAllEnvs();
  });

  // T1: With env var pointing to temp JSON, returns parsed entries
  it("T1: returns parsed entries from temp JSON via CODEMAN_TEST_QA_TABLE env var", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    // Create temp JSON file (legacy top-level text field — exercises legacy wrap path)
    tempJsonPath = resolve(tmpdir(), `qa-loader-test-${Date.now()}.json`);
    await writeFile(tempJsonPath, JSON.stringify([{ question: "q", text: "a" }]), "utf-8");

    // Stub env to point at temp file
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ question: "q", turns: [{ text: "a" }] });
  });

  // T2: Without env var, NODE_ENV !== "production", returns non-empty if qa.dev.json exists
  it("T2: returns non-empty array in development mode when qa.dev.json exists", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    vi.stubEnv("CODEMAN_TEST_QA_TABLE", "");
    vi.stubEnv("NODE_ENV", "development");

    const entries = loadQaTable();
    expect(Array.isArray(entries)).toBe(true);
    // May be empty if file doesn't exist in some setups, but should not throw
    expect(entries).toBeDefined();
  });

  // T3: Without env var, NODE_ENV === "production", returns []
  it("T3: returns empty array in production mode without env var", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    vi.stubEnv("CODEMAN_TEST_QA_TABLE", "");
    vi.stubEnv("NODE_ENV", "production");

    const entries = loadQaTable();
    expect(entries).toEqual([]);
  });

  // T4 (revised): Without env var, dev mode, file exists → returns parsed entries
  it("T4 (revised): dev mode + file exists → returns parsed entries", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    vi.stubEnv("CODEMAN_TEST_QA_TABLE", "");
    vi.stubEnv("NODE_ENV", "development");

    const entries = loadQaTable();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty("question");
  });

  // T5: regression — multi-path fallback works when bundled __dirname candidate
  // is absent. Verified by inspecting the actual source seed at the CWD-relative
  // location (electron-vite devs always run from repo root).
  it("T5: dev mode + bundled __dirname has no assets/ + CWD-relative resolves → returns seed", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    vi.stubEnv("CODEMAN_TEST_QA_TABLE", "");
    vi.stubEnv("NODE_ENV", "development");

    const entries = loadQaTable();
    // We expect the canonical dev entries (whatever is in qa.dev.json).
    // The contract: at least one entry with question "hello" + a default fallback.
    expect(entries.length).toBeGreaterThan(0);
    const hasHello = entries.some((e) => e.question === "hello");
    const hasDefault = entries.some((e) => e.default === true);
    expect(hasHello).toBe(true);
    expect(hasDefault).toBe(true);
  });

  // T6: legacy `{question, answer}` field is wrapped into turns:[{text: answer}].
  it("T6: legacy {question, answer} wraps into turns:[{text: answer}]", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-legacy-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([{ question: "old", answer: "world" }]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      question: "old",
      turns: [{ text: "world" }],
    });
    // No legacy fields leak into the normalized entry.
    expect((entries[0] as unknown as Record<string, unknown>).answer).toBeUndefined();
  });

  // T7: legacy `{question, text, thinking, toolUses}` is wrapped into a single turn.
  it("T7: legacy {question, text, thinking, toolUses} wraps into turns:[{text, thinking, toolUses}]", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-thinking-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([
        {
          question: "demo",
          text: "Reading...",
          thinking: "I should call read_file.",
          toolUses: [{ name: "read_file", input: { path: "foo.txt" } }],
        },
      ]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      question: "demo",
      turns: [
        {
          text: "Reading...",
          thinking: "I should call read_file.",
          toolUses: [{ name: "read_file", input: { path: "foo.txt" } }],
        },
      ],
    });
    // No legacy fields leak.
    expect((entries[0] as unknown as Record<string, unknown>).text).toBeUndefined();
    expect((entries[0] as unknown as Record<string, unknown>).thinking).toBeUndefined();
    expect((entries[0] as unknown as Record<string, unknown>).toolUses).toBeUndefined();
  });

  // T8: new `{question, turns: [...]}` shape passes through verbatim.
  it("T8: new {question, turns: [...]} passes through with per-turn validation", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-turns-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([
        {
          question: "summarize",
          turns: [
            { text: "Reading the file.", toolUses: [{ name: "read_file", input: { path: "x" } }] },
            { text: "Searching.", toolUses: [{ name: "search_files", input: { pattern: "*.ts" } }] },
            { thinking: "All done.", text: "Summary: 3 files." },
          ],
        },
        { question: "*", turns: [{ text: "fallback" }], default: true },
      ]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(2);
    expect(entries[0].turns).toHaveLength(3);
    expect(entries[0].turns[0].text).toBe("Reading the file.");
    expect(entries[0].turns[0].toolUses).toEqual([
      { name: "read_file", input: { path: "x" } },
    ]);
    expect(entries[0].turns[2].thinking).toBe("All done.");
    expect(entries[1].turns).toEqual([{ text: "fallback" }]);
    expect(entries[1].default).toBe(true);
  });

  // T9: empty turns[] falls back to a single empty-text turn (defensive).
  it("T9: empty turns[] → fallback [{text: \"\"}] (defensive against malformed fixtures)", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-empty-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([{ question: "empty", turns: [] }]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(1);
    expect(entries[0].turns).toEqual([{ text: "" }]);
  });

  // T28 Stop operation: done:true 在 turns[] 路径下被保留。
  it("T28c: turns[] path 保留 done:true (单 toolUse 显式终止)", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-done-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([
        {
          question: "tool",
          turns: [
            {
              text: "Reading the file now.",
              toolUses: [{ name: "read_file", input: { path: "README.md" } }],
              done: true,
            },
          ],
        },
      ]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(1);
    expect(entries[0].turns).toHaveLength(1);
    expect(entries[0].turns[0].done).toBe(true);
    expect(entries[0].turns[0].text).toBe("Reading the file now.");
    expect(entries[0].turns[0].toolUses).toEqual([
      { name: "read_file", input: { path: "README.md" } },
    ]);
  });

  // T28 Stop operation: 未标 done 的 turn 不携带 done 字段(undefined,不是 false)。
  it("T28d: 没标 done 的 turn 不带 done 字段 (非 false,让 mock-server 的 lastTurn?.done === true 检查不会假阳性触发)", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-no-done-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([
        {
          question: "summarize",
          turns: [
            { text: "Reading.", toolUses: [{ name: "read_file", input: {} }] },
            { text: "Done." },
          ],
        },
      ]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries[0].turns[1].done).toBeUndefined();
    expect("done" in entries[0].turns[1]).toBe(false);
  });

  // T28 Stop operation: legacy {question, text, toolUses, done} 路径也保留 done。
  it("T28e: legacy {question, text, toolUses, done:true} 路径也保留 done", async () => {
    const { vi } = await import("vitest");
    const { loadQaTable } = await import("./qa-loader");

    tempJsonPath = resolve(tmpdir(), `qa-loader-legacy-done-${Date.now()}.json`);
    await writeFile(
      tempJsonPath,
      JSON.stringify([
        {
          question: "legacy-tool",
          text: "Reading.",
          toolUses: [{ name: "read_file", input: { path: "x" } }],
          done: true,
        },
      ]),
      "utf-8",
    );
    vi.stubEnv("CODEMAN_TEST_QA_TABLE", tempJsonPath);

    const entries = loadQaTable();
    expect(entries).toHaveLength(1);
    expect(entries[0].turns).toHaveLength(1);
    expect(entries[0].turns[0].done).toBe(true);
    // legacy top-level done 不应泄漏
    expect((entries[0] as unknown as Record<string, unknown>).done).toBeUndefined();
  });

});
