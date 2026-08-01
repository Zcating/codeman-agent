import { describe, it, expect, vi } from "vitest";

const fakeApp = vi.hoisted(() => ({
  getPath: vi.fn().mockReturnValue("/tmp/codeman-agent-test"),
}));

vi.mock("electron", () => ({ app: fakeApp }));

const dbInstances = vi.hoisted(() => [] as unknown[]);

const FakeDatabase = vi.hoisted(() => {
  return class FakeDatabase {
    constructor(_path: string) {
      dbInstances.push(this);
    }
    pragma(): void {}
    exec(): void {}
    prepare() {
      return {
        all: () => [],
        get: () => undefined,
        run: () => undefined,
      };
    }
    close(): void {}
  };
});

vi.mock("better-sqlite3", () => ({ default: FakeDatabase }));

import { getOrInitDatabase } from "./mod";

describe("getOrInitDatabase", () => {
  it("initializes and returns a Database on first call", () => {
    const db = getOrInitDatabase();
    expect(db).toBeInstanceOf(FakeDatabase);
    expect(dbInstances).toHaveLength(1);
  });

  it("returns the same instance on repeated calls", () => {
    const a = getOrInitDatabase();
    const b = getOrInitDatabase();
    expect(a).toBe(b);
    expect(dbInstances).toHaveLength(1);
  });
});
